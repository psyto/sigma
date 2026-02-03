use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    #[msg("Symbol too long (max 16 characters)")]
    SymbolTooLong,

    #[msg("Sample interval too short (min 60 seconds)")]
    IntervalTooShort,

    #[msg("Invalid max samples (must be 100-10000)")]
    InvalidMaxSamples,

    #[msg("Feed is inactive")]
    FeedInactive,

    #[msg("Invalid price (must be > 0)")]
    InvalidPrice,

    #[msg("Too soon since last sample")]
    TooSoon,

    #[msg("Unauthorized")]
    Unauthorized,
}
