use anchor_lang::prelude::*;

#[error_code]
pub enum VolswapError {
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Pool is not active")]
    PoolInactive,

    #[msg("Epoch is not active")]
    EpochNotActive,

    #[msg("Epoch not yet ended")]
    EpochNotEnded,

    #[msg("Epoch already settled")]
    EpochAlreadySettled,

    #[msg("Position not settled")]
    NotSettled,

    #[msg("Position already claimed")]
    AlreadyClaimed,

    #[msg("Notional below minimum")]
    NotionalTooLow,

    #[msg("Notional above maximum")]
    NotionalTooHigh,

    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("Premium exceeds limit")]
    PremiumExceedsLimit,

    #[msg("Premium below minimum")]
    PremiumBelowMinimum,

    #[msg("Invalid strike variance")]
    InvalidStrikeVariance,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Epoch duration too short")]
    EpochTooShort,

    #[msg("Invalid fee rate")]
    InvalidFeeRate,
}
