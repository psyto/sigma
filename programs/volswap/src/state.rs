use anchor_lang::prelude::*;

/// Variance swap pool state
#[account]
#[derive(InitSpace)]
pub struct VariancePool {
    /// Pool authority (admin)
    pub authority: Pubkey,

    /// Collateral mint (USDC)
    pub collateral_mint: Pubkey,

    /// Underlying asset mint (e.g., SOL)
    pub underlying_mint: Pubkey,

    /// Associated price feed from shared oracle
    pub price_feed: Pubkey,

    /// Associated variance tracker from shared oracle
    pub variance_tracker: Pubkey,

    // ═══════════════════════════════════════════════════════════════════════
    // Pool Parameters
    // ═══════════════════════════════════════════════════════════════════════

    /// Epoch duration in seconds
    pub epoch_duration_seconds: u64,

    /// Minimum notional per position
    pub min_notional: u64,

    /// Maximum notional per position
    pub max_notional: u64,

    /// Fee rate in basis points
    pub fee_rate_bps: u16,

    /// Variance cap for risk management (bps)
    pub variance_cap_bps: u64,

    /// Early exit penalty in basis points
    pub early_exit_penalty_bps: u16,

    // ═══════════════════════════════════════════════════════════════════════
    // Current Epoch State
    // ═══════════════════════════════════════════════════════════════════════

    /// Current epoch number
    pub current_epoch: u64,

    /// Epoch start timestamp
    pub epoch_start_time: i64,

    /// Epoch end timestamp
    pub epoch_end_time: i64,

    /// Strike variance for current epoch (in basis points)
    pub strike_variance_bps: u64,

    /// Realized variance at settlement (in basis points)
    pub realized_variance_bps: u64,

    /// Whether current epoch is settled
    pub is_epoch_settled: bool,

    // ═══════════════════════════════════════════════════════════════════════
    // Pool Statistics
    // ═══════════════════════════════════════════════════════════════════════

    /// Total long notional for current epoch
    pub total_long_notional: u64,

    /// Total short notional for current epoch
    pub total_short_notional: u64,

    /// Number of active positions
    pub active_positions: u32,

    /// Total fees collected (lifetime)
    pub total_fees_collected: u64,

    /// Total volume (lifetime)
    pub total_volume: u128,

    /// Total epochs completed
    pub total_epochs: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // Liquidity Pool State
    // ═══════════════════════════════════════════════════════════════════════

    /// Total LP shares issued
    pub total_lp_shares: u64,

    /// Total liquidity deposited
    pub total_liquidity: u64,

    /// Accumulated LP fees
    pub accumulated_lp_fees: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════════════════════

    /// Whether pool is active
    pub is_active: bool,

    /// Whether pool is paused (emergency)
    pub is_paused: bool,

    pub bump: u8,
    pub vault_bump: u8,
}

impl VariancePool {
    /// Calculate P&L for a position
    pub fn calculate_pnl(&self, position: &VariancePosition) -> i64 {
        if !self.is_epoch_settled {
            return 0;
        }

        // Cap realized variance for risk management
        let realized = std::cmp::min(self.realized_variance_bps, self.variance_cap_bps) as i64;
        let strike = position.strike_variance_bps as i64;
        let notional = position.notional as i64;

        // P&L = Notional × (RealizedVar - StrikeVar) / 10000
        let variance_diff = realized - strike;
        let raw_pnl = (notional * variance_diff) / 10000;

        if position.is_long {
            raw_pnl
        } else {
            -raw_pnl
        }
    }

    /// Calculate premium for a new position
    /// Uses simplified Black-Scholes-like approach
    pub fn calculate_premium(&self, notional: u64, is_long: bool) -> u64 {
        // Base premium is a function of:
        // 1. Distance from current implied vol to strike
        // 2. Time remaining in epoch
        // 3. Historical vol of vol

        let base_premium_bps: u64 = 100; // 1% base premium

        // Adjust for imbalance - if more longs, increase long premium
        let imbalance_factor = if self.total_long_notional > 0 || self.total_short_notional > 0 {
            let total = self.total_long_notional + self.total_short_notional;
            if is_long {
                // More longs = higher premium for longs
                10000 + (self.total_long_notional * 2000 / total.max(1))
            } else {
                // More shorts = higher premium for shorts
                10000 + (self.total_short_notional * 2000 / total.max(1))
            }
        } else {
            10000
        };

        (notional * base_premium_bps * imbalance_factor) / (10000 * 10000)
    }

    /// Calculate required margin for a position
    pub fn calculate_margin(&self, notional: u64, is_long: bool) -> u64 {
        // Longs: 20% margin (limited downside - can only lose premium + margin)
        // Shorts: 30% margin (theoretically unlimited upside risk)
        let margin_bps: u64 = if is_long { 2000 } else { 3000 };
        (notional * margin_bps) / 10000
    }

    /// Calculate early exit penalty
    pub fn calculate_early_exit_refund(&self, position: &VariancePosition, current_time: i64) -> u64 {
        // Calculate time-based refund with penalty
        let elapsed = current_time - position.opened_at;
        let total_duration = self.epoch_end_time - self.epoch_start_time;

        if elapsed <= 0 || total_duration <= 0 {
            return position.collateral_deposited;
        }

        // Pro-rata based on time remaining
        let time_ratio = if elapsed >= total_duration {
            0
        } else {
            ((total_duration - elapsed) as u64 * 10000) / total_duration as u64
        };

        // Apply penalty
        let penalty_factor = 10000 - self.early_exit_penalty_bps as u64;
        let refund_before_penalty = (position.collateral_deposited * time_ratio) / 10000;
        (refund_before_penalty * penalty_factor) / 10000
    }

    /// Check if epoch can be settled
    pub fn can_settle(&self, current_time: i64) -> bool {
        !self.is_epoch_settled && current_time >= self.epoch_end_time
    }

    /// Get net exposure (long - short notional)
    pub fn get_net_exposure(&self) -> i64 {
        self.total_long_notional as i64 - self.total_short_notional as i64
    }
}

/// Individual variance swap position
#[account]
#[derive(InitSpace)]
pub struct VariancePosition {
    /// Position owner
    pub owner: Pubkey,

    /// Associated pool
    pub pool: Pubkey,

    /// Epoch when opened
    pub epoch: u64,

    /// Notional amount
    pub notional: u64,

    /// Strike variance when opened (bps)
    pub strike_variance_bps: u64,

    /// Whether long (true) or short (false)
    pub is_long: bool,

    /// Collateral deposited
    pub collateral_deposited: u64,

    /// Premium paid (for longs) or received (for shorts)
    pub premium: u64,

    /// Settlement P&L (set after settlement)
    pub settlement_pnl: i64,

    /// Payout amount (set after settlement)
    pub payout_amount: u64,

    /// Position status
    pub status: PositionStatus,

    /// Open timestamp
    pub opened_at: i64,

    /// Settled timestamp
    pub settled_at: Option<i64>,

    pub bump: u8,
}

impl VariancePosition {
    /// Check if position is profitable at given realized variance
    pub fn is_profitable_at(&self, realized_variance_bps: u64) -> bool {
        let realized = realized_variance_bps as i64;
        let strike = self.strike_variance_bps as i64;

        if self.is_long {
            realized > strike
        } else {
            realized < strike
        }
    }

    /// Calculate unrealized P&L at given realized variance
    pub fn calculate_unrealized_pnl(&self, realized_variance_bps: u64) -> i64 {
        let realized = realized_variance_bps as i64;
        let strike = self.strike_variance_bps as i64;
        let notional = self.notional as i64;

        let variance_diff = realized - strike;
        let raw_pnl = (notional * variance_diff) / 10000;

        if self.is_long {
            raw_pnl
        } else {
            -raw_pnl
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionStatus {
    /// Position is active and will be settled at epoch end
    Active,
    /// Position has been settled, payout calculated
    Settled,
    /// Payout has been claimed
    Claimed,
    /// Position was liquidated
    Liquidated,
    /// Position was closed early
    ClosedEarly,
}

impl Default for PositionStatus {
    fn default() -> Self {
        PositionStatus::Active
    }
}

/// Liquidity provider account
#[account]
#[derive(InitSpace)]
pub struct LiquidityProvider {
    /// LP owner
    pub owner: Pubkey,

    /// Associated pool
    pub pool: Pubkey,

    /// LP shares owned
    pub shares: u64,

    /// Total deposited (for tracking)
    pub total_deposited: u64,

    /// Total withdrawn (for tracking)
    pub total_withdrawn: u64,

    /// Accumulated fees claimed
    pub fees_claimed: u64,

    /// Deposit timestamp
    pub deposited_at: i64,

    /// Last interaction timestamp
    pub last_interaction: i64,

    pub bump: u8,
}

impl LiquidityProvider {
    /// Calculate current value of LP shares
    pub fn calculate_value(&self, pool: &VariancePool) -> u64 {
        if pool.total_lp_shares == 0 {
            return 0;
        }

        // Value = shares / total_shares * total_liquidity
        (self.shares as u128 * pool.total_liquidity as u128 / pool.total_lp_shares as u128) as u64
    }

    /// Calculate claimable fees
    pub fn calculate_claimable_fees(&self, pool: &VariancePool) -> u64 {
        if pool.total_lp_shares == 0 {
            return 0;
        }

        // Pro-rata share of accumulated fees
        let total_fees = pool.accumulated_lp_fees;
        let share_ratio = (self.shares as u128 * 10000) / pool.total_lp_shares as u128;
        let entitled_fees = (total_fees as u128 * share_ratio / 10000) as u64;

        entitled_fees.saturating_sub(self.fees_claimed)
    }
}

/// Epoch history record
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct EpochRecord {
    /// Epoch number
    pub epoch: u64,
    /// Strike variance (bps)
    pub strike_variance_bps: u64,
    /// Realized variance (bps)
    pub realized_variance_bps: u64,
    /// Total long notional
    pub total_long_notional: u64,
    /// Total short notional
    pub total_short_notional: u64,
    /// Number of positions
    pub position_count: u32,
    /// Epoch start timestamp
    pub start_time: i64,
    /// Epoch end timestamp
    pub end_time: i64,
}
