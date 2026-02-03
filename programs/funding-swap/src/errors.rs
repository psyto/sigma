use anchor_lang::prelude::*;

#[error_code]
pub enum FundingSwapError {
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Pool is not active")]
    PoolInactive,

    #[msg("Swap not settled")]
    NotSettled,

    #[msg("Swap already claimed")]
    AlreadyClaimed,

    #[msg("Notional below minimum")]
    NotionalTooLow,

    #[msg("Notional above maximum")]
    NotionalTooHigh,

    #[msg("Duration exceeds maximum")]
    DurationTooLong,

    #[msg("Duration too short")]
    DurationTooShort,

    #[msg("Fixed rate exceeds limit")]
    RateExceedsLimit,

    #[msg("Fixed rate below minimum")]
    RateBelowMinimum,

    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("Swap not yet ended")]
    SwapNotEnded,

    #[msg("Swap already settled")]
    SwapAlreadySettled,

    #[msg("Funding period not yet due")]
    FundingNotDue,

    #[msg("Invalid market symbol")]
    InvalidMarketSymbol,

    #[msg("Invalid fee rate")]
    InvalidFeeRate,

    #[msg("Arithmetic overflow")]
    Overflow,
}
