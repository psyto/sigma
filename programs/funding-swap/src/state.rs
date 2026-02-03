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

    /// Funding period in seconds (typically 8 hours)
    pub funding_period_seconds: u64,

    /// Minimum swap notional
    pub min_notional: u64,

    /// Maximum swap notional
    pub max_notional: u64,

    /// Maximum duration in funding periods
    pub max_duration_periods: u16,

    /// Fee rate in basis points
    pub fee_rate_bps: u16,

    // ═══════════════════════════════════════════════════════════════════════
    // Current State
    // ═══════════════════════════════════════════════════════════════════════

    /// Current fixed rate for new swaps (market-making rate)
    pub current_fixed_rate_bps: i16,

    /// Last processed funding period timestamp
    pub last_funding_time: i64,

    /// Current funding period index
    pub current_period: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // Pool Statistics
    // ═══════════════════════════════════════════════════════════════════════

    /// Total receiver notional (pay fixed, receive floating)
    pub total_receiver_notional: u64,

    /// Total payer notional (receive fixed, pay floating)
    pub total_payer_notional: u64,

    /// Total swaps created
    pub total_swaps: u64,

    /// Total volume
    pub total_volume: u128,

    /// Total fees collected
    pub total_fees_collected: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // State Flags
    // ═══════════════════════════════════════════════════════════════════════

    pub is_active: bool,

    pub bump: u8,
    pub vault_bump: u8,
}

impl FundingPool {
    /// Calculate P&L for a funding period
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
}

/// Individual funding swap position
#[account]
#[derive(InitSpace)]
pub struct FundingSwapPosition {
    /// Position owner
    pub owner: Pubkey,

    /// Associated pool
    pub pool: Pubkey,

    /// Swap index
    pub swap_index: u64,

    /// Notional amount
    pub notional: u64,

    /// Fixed rate in basis points (can be negative)
    pub fixed_rate_bps: i16,

    /// Whether receiver (true) or payer (false)
    /// Receiver: pays fixed, receives floating
    /// Payer: receives fixed, pays floating
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

    /// Final payout amount
    pub payout_amount: u64,

    /// Swap status
    pub status: SwapStatus,

    /// Open timestamp
    pub opened_at: i64,

    /// Settled timestamp
    pub settled_at: Option<i64>,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SwapStatus {
    Active,
    Settled,
    Claimed,
    Liquidated,
}

impl Default for SwapStatus {
    fn default() -> Self {
        SwapStatus::Active
    }
}

/// Funding period record for historical tracking
#[account]
#[derive(InitSpace)]
pub struct FundingPeriodRecord {
    pub pool: Pubkey,
    pub period_index: u64,
    pub actual_rate_bps: i16,
    pub timestamp: i64,
    pub bump: u8,
}
