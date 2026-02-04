use anchor_lang::prelude::*;

#[error_code]
pub enum FundingSwapError {
    // ============================================================================
    // Authorization Errors
    // ============================================================================
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    // ============================================================================
    // Pool State Errors
    // ============================================================================
    #[msg("Pool is not active")]
    PoolInactive,

    #[msg("Pool is paused")]
    PoolPaused,

    #[msg("Invalid pool")]
    InvalidPool,

    // ============================================================================
    // Swap State Errors
    // ============================================================================
    #[msg("Swap not settled")]
    NotSettled,

    #[msg("Swap already settled")]
    SwapAlreadySettled,

    #[msg("Swap already claimed")]
    AlreadyClaimed,

    #[msg("Swap not yet ended")]
    SwapNotEnded,

    #[msg("Invalid swap status")]
    InvalidSwapStatus,

    // ============================================================================
    // Notional Errors
    // ============================================================================
    #[msg("Notional below minimum")]
    NotionalTooLow,

    #[msg("Notional above maximum")]
    NotionalTooHigh,

    // ============================================================================
    // Duration Errors
    // ============================================================================
    #[msg("Duration exceeds maximum")]
    DurationTooLong,

    #[msg("Duration too short")]
    DurationTooShort,

    // ============================================================================
    // Rate Errors
    // ============================================================================
    #[msg("Fixed rate exceeds limit")]
    RateExceedsLimit,

    #[msg("Fixed rate below minimum")]
    RateBelowMinimum,

    #[msg("Invalid rate value")]
    InvalidRate,

    // ============================================================================
    // Collateral Errors
    // ============================================================================
    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("Insufficient pool liquidity")]
    InsufficientLiquidity,

    // ============================================================================
    // Funding Period Errors
    // ============================================================================
    #[msg("Funding period not yet due")]
    FundingNotDue,

    #[msg("Funding period already processed")]
    FundingAlreadyProcessed,

    // ============================================================================
    // Parameter Errors
    // ============================================================================
    #[msg("Invalid market symbol")]
    InvalidMarketSymbol,

    #[msg("Invalid fee rate (max 5%)")]
    InvalidFeeRate,

    #[msg("Invalid funding period (min 1 hour)")]
    InvalidFundingPeriod,

    #[msg("Invalid early exit penalty (max 50%)")]
    InvalidEarlyExitPenalty,

    // ============================================================================
    // Oracle Errors
    // ============================================================================
    #[msg("Invalid oracle account")]
    InvalidOracle,

    #[msg("Oracle data is stale")]
    StaleOracleData,

    #[msg("Failed to read funding rate from oracle")]
    OracleReadError,

    // ============================================================================
    // Liquidity Errors
    // ============================================================================
    #[msg("LP deposit amount too low")]
    DepositTooLow,

    #[msg("Insufficient LP shares")]
    InsufficientShares,

    #[msg("Withdrawal would leave pool undercollateralized")]
    WithdrawalExceedsAvailable,

    #[msg("LP withdrawal is locked during active swaps")]
    WithdrawalLocked,

    // ============================================================================
    // Math Errors
    // ============================================================================
    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Division by zero")]
    DivisionByZero,

    // ============================================================================
    // Token Errors
    // ============================================================================
    #[msg("Token transfer failed")]
    TransferFailed,

    #[msg("Invalid mint")]
    InvalidMint,
}
