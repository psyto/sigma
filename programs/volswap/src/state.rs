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

    /// Total fees collected (lifetime)
    pub total_fees_collected: u64,

    /// Total volume (lifetime)
    pub total_volume: u128,

    /// Total epochs completed
    pub total_epochs: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════════════════════

    /// Whether pool is active
    pub is_active: bool,

    pub bump: u8,
    pub vault_bump: u8,
}

impl VariancePool {
    /// Calculate P&L for a position
    pub fn calculate_pnl(&self, position: &VariancePosition) -> i64 {
        if !self.is_epoch_settled {
            return 0;
        }

        let realized = self.realized_variance_bps as i64;
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
    /// Premium = Notional × |StrikeVar - ImpliedVar| / 10000 × factor
    pub fn calculate_premium(&self, notional: u64, is_long: bool) -> u64 {
        // Simplified premium calculation
        // In production, this would use implied volatility surface
        let base_premium_bps: u64 = 100; // 1% base premium
        (notional * base_premium_bps) / 10000
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionStatus {
    Active,
    Settled,
    Claimed,
    Liquidated,
}

impl Default for PositionStatus {
    fn default() -> Self {
        PositionStatus::Active
    }
}
