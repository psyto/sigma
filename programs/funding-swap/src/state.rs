use anchor_lang::prelude::*;

/// Funding swap pool state
#[account]
#[derive(InitSpace)]
pub struct FundingPool {
    /// Pool authority
    pub authority: Pubkey,

    /// Market symbol (e.g., "SOL-PERP")
    #[max_len(16)]
    pub market_symbol: String,

    /// Collateral mint (USDC)
    pub collateral_mint: Pubkey,

    /// Funding rate feed from shared oracle
    pub funding_feed: Pubkey,

    // ═══════════════════════════════════════════════════════════════════════
    // Pool Parameters
    // ═══════════════════════════════════════════════════════════════════════

    /// Funding period in seconds (typically 8 hours = 28800)
    pub funding_period_seconds: u64,

    /// Minimum swap notional
    pub min_notional: u64,

    /// Maximum swap notional
    pub max_notional: u64,

    /// Maximum duration in funding periods
    pub max_duration_periods: u16,

    /// Fee rate in basis points
    pub fee_rate_bps: u16,

    /// Early exit penalty in basis points
    pub early_exit_penalty_bps: u16,

    // ═══════════════════════════════════════════════════════════════════════
    // Current State
    // ═══════════════════════════════════════════════════════════════════════

    /// Current fixed rate for new swaps (market-making rate, can be negative)
    pub current_fixed_rate_bps: i16,

    /// Last processed funding period timestamp
    pub last_funding_time: i64,

    /// Current funding period index
    pub current_period: u64,

    /// Last actual funding rate from oracle (bps)
    pub last_actual_rate_bps: i16,

    // ═══════════════════════════════════════════════════════════════════════
    // Pool Statistics
    // ═══════════════════════════════════════════════════════════════════════

    /// Total receiver notional (pay fixed, receive floating)
    pub total_receiver_notional: u64,

    /// Total payer notional (receive fixed, pay floating)
    pub total_payer_notional: u64,

    /// Total active swaps
    pub active_swaps: u32,

    /// Total swaps created
    pub total_swaps: u64,

    /// Total volume
    pub total_volume: u128,

    /// Total fees collected
    pub total_fees_collected: u64,

    /// Total funding periods processed
    pub total_periods_processed: u64,

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
    // State Flags
    // ═══════════════════════════════════════════════════════════════════════

    /// Whether pool is active
    pub is_active: bool,

    /// Whether pool is paused (emergency)
    pub is_paused: bool,

    pub bump: u8,
    pub vault_bump: u8,
}

impl FundingPool {
    /// Calculate P&L for a single funding period
    pub fn calculate_period_pnl(
        &self,
        swap: &FundingSwapPosition,
        actual_rate_bps: i16,
    ) -> i64 {
        let notional = swap.notional as i64;
        let rate_diff = actual_rate_bps as i64 - swap.fixed_rate_bps as i64;

        // P&L = Notional × (ActualRate - FixedRate) / 10000
        let pnl = (notional * rate_diff) / 10000;

        if swap.is_receiver {
            pnl  // Receivers profit when actual > fixed
        } else {
            -pnl // Payers profit when actual < fixed
        }
    }

    /// Calculate required margin for a swap
    pub fn calculate_margin(&self, notional: u64, duration_periods: u16) -> u64 {
        // Margin = Notional × max_rate_move × duration / 10000
        // Assume max rate move of 50 bps per period
        let max_adverse_move: u64 = 50 * duration_periods as u64;
        (notional * max_adverse_move) / 10000
    }

    /// Calculate fee for a swap
    pub fn calculate_fee(&self, notional: u64) -> u64 {
        (notional * self.fee_rate_bps as u64) / 10000
    }

    /// Calculate early exit refund with penalty
    pub fn calculate_early_exit_refund(
        &self,
        swap: &FundingSwapPosition,
        current_period: u64,
    ) -> u64 {
        // Calculate periods remaining
        let periods_elapsed = current_period.saturating_sub(swap.start_period) as u16;
        let periods_remaining = swap.duration_periods.saturating_sub(periods_elapsed);

        if periods_remaining == 0 {
            return swap.collateral_deposited;
        }

        // Pro-rata refund based on remaining periods
        let total_periods = swap.duration_periods as u64;
        let remaining_periods = periods_remaining as u64;

        let pro_rata_refund = (swap.collateral_deposited * remaining_periods) / total_periods;

        // Apply penalty
        let penalty_factor = 10000 - self.early_exit_penalty_bps as u64;
        (pro_rata_refund * penalty_factor) / 10000
    }

    /// Get net exposure (receiver - payer notional)
    pub fn get_net_exposure(&self) -> i64 {
        self.total_receiver_notional as i64 - self.total_payer_notional as i64
    }

    /// Check if funding period is due
    pub fn is_funding_due(&self, current_time: i64) -> bool {
        current_time - self.last_funding_time >= self.funding_period_seconds as i64
    }

    /// Adjust fixed rate based on imbalance
    pub fn calculate_rate_adjustment(&self) -> i16 {
        // If more receivers than payers, increase fixed rate to attract payers
        // If more payers than receivers, decrease fixed rate to attract receivers
        let imbalance = self.get_net_exposure();
        let adjustment = (imbalance / 1_000_000) as i16; // Scale down
        adjustment.clamp(-10, 10) // Max 10 bps adjustment per period
    }
}

/// Individual funding swap position
#[account]
#[derive(InitSpace)]
pub struct FundingSwapPosition {
    /// Position owner
    pub owner: Pubkey,

    /// Associated pool
    pub pool: Pubkey,

    /// Swap index (unique per user per pool)
    pub swap_index: u64,

    /// Notional amount
    pub notional: u64,

    /// Fixed rate in basis points (can be negative)
    pub fixed_rate_bps: i16,

    /// Whether receiver (true) or payer (false)
    /// Receiver: pays fixed, receives floating (profits when funding > fixed)
    /// Payer: receives fixed, pays floating (profits when funding < fixed)
    pub is_receiver: bool,

    /// Duration in funding periods
    pub duration_periods: u16,

    /// Starting period
    pub start_period: u64,

    /// Ending period
    pub end_period: u64,

    /// Collateral deposited
    pub collateral_deposited: u64,

    /// Accumulated P&L from settled periods
    pub accumulated_pnl: i64,

    /// Number of periods settled
    pub periods_settled: u16,

    /// Final payout amount (set after settlement)
    pub payout_amount: u64,

    /// Swap status
    pub status: SwapStatus,

    /// Open timestamp
    pub opened_at: i64,

    /// Settled timestamp
    pub settled_at: Option<i64>,

    pub bump: u8,
}

impl FundingSwapPosition {
    /// Check if swap has ended
    pub fn has_ended(&self, current_period: u64) -> bool {
        current_period >= self.end_period
    }

    /// Get remaining periods
    pub fn remaining_periods(&self, current_period: u64) -> u16 {
        if current_period >= self.end_period {
            0
        } else {
            (self.end_period - current_period) as u16
        }
    }

    /// Check if swap is profitable at given rate
    pub fn is_profitable_at(&self, actual_rate_bps: i16) -> bool {
        if self.is_receiver {
            actual_rate_bps > self.fixed_rate_bps
        } else {
            actual_rate_bps < self.fixed_rate_bps
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SwapStatus {
    /// Swap is active and accruing funding
    Active,
    /// Swap has been settled, payout calculated
    Settled,
    /// Payout has been claimed
    Claimed,
    /// Swap was liquidated
    Liquidated,
    /// Swap was closed early
    ClosedEarly,
}

impl Default for SwapStatus {
    fn default() -> Self {
        SwapStatus::Active
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
    pub fn calculate_value(&self, pool: &FundingPool) -> u64 {
        if pool.total_lp_shares == 0 {
            return 0;
        }

        // Value = shares / total_shares * total_liquidity
        (self.shares as u128 * pool.total_liquidity as u128 / pool.total_lp_shares as u128) as u64
    }

    /// Calculate claimable fees
    pub fn calculate_claimable_fees(&self, pool: &FundingPool) -> u64 {
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

/// Funding period record for historical tracking
#[account]
#[derive(InitSpace)]
pub struct FundingPeriodRecord {
    pub pool: Pubkey,
    pub period_index: u64,
    pub actual_rate_bps: i16,
    pub fixed_rate_bps: i16,
    pub total_receiver_notional: u64,
    pub total_payer_notional: u64,
    pub timestamp: i64,
    pub bump: u8,
}
