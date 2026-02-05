use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    // ============================================================================
    // General Errors
    // ============================================================================
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    #[msg("Feed is inactive")]
    FeedInactive,

    #[msg("Symbol too long (max 16 characters)")]
    SymbolTooLong,

    // ============================================================================
    // Price Feed Errors
    // ============================================================================
    #[msg("Sample interval too short (min 60 seconds)")]
    IntervalTooShort,

    #[msg("Invalid max samples (must be 100-10000)")]
    InvalidMaxSamples,

    #[msg("Invalid price (must be > 0)")]
    InvalidPrice,

    #[msg("Too soon since last sample")]
    TooSoon,

    #[msg("Price is stale")]
    StalePrice,

    #[msg("No Pyth feed configured for this price feed")]
    NoPythFeed,

    #[msg("Invalid Pyth feed account")]
    InvalidPythFeed,

    #[msg("Pyth price is negative")]
    NegativePythPrice,

    #[msg("Pyth price confidence too low")]
    LowPythConfidence,

    #[msg("Invalid price feed")]
    InvalidPriceFeed,

    // ============================================================================
    // Funding Feed Errors
    // ============================================================================
    #[msg("Funding rate out of valid range")]
    FundingRateOutOfRange,

    #[msg("Funding interval too short")]
    FundingIntervalTooShort,

    // ============================================================================
    // Aggregated Feed Errors
    // ============================================================================
    #[msg("Maximum sources reached (8)")]
    MaxSourcesReached,

    #[msg("Source already exists in feed")]
    SourceAlreadyExists,

    #[msg("Source not found in feed")]
    SourceNotFound,

    #[msg("No active sources available")]
    NoActiveSources,

    #[msg("Invalid source type")]
    InvalidSourceType,

    #[msg("Invalid weight (must be 1-10000)")]
    InvalidWeight,

    // ============================================================================
    // Variance Tracker Errors
    // ============================================================================
    #[msg("Epoch not yet ended")]
    EpochNotEnded,

    #[msg("Epoch already finalized")]
    EpochAlreadyFinalized,

    #[msg("Epoch not finalized")]
    EpochNotFinalized,

    #[msg("Invalid epoch duration")]
    InvalidEpochDuration,

    #[msg("Insufficient samples for variance calculation")]
    InsufficientSamples,

    // ============================================================================
    // Math Errors
    // ============================================================================
    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Division by zero")]
    DivisionByZero,

    // ============================================================================
    // Volatility Index Errors
    // ============================================================================
    #[msg("Invalid variance tracker")]
    InvalidVarianceTracker,

    #[msg("Invalid implied weight (must be 0-10000)")]
    InvalidImpliedWeight,

    // ============================================================================
    // CEX Funding Feed Errors
    // ============================================================================
    #[msg("Too many exchange sources (max 8)")]
    TooManySources,

    #[msg("Exchange not found in feed")]
    ExchangeNotFound,

    #[msg("Exchange already exists in feed")]
    ExchangeAlreadyExists,

    // ============================================================================
    // Secondary Market Errors
    // ============================================================================
    #[msg("Position is inactive")]
    PositionInactive,

    #[msg("Position has expired")]
    PositionExpired,

    #[msg("Position is not listed for sale")]
    NotListed,

    #[msg("Position is already listed")]
    AlreadyListed,

    #[msg("Market is inactive")]
    MarketInactive,

    #[msg("Protocol mismatch")]
    ProtocolMismatch,

    #[msg("Price below minimum")]
    PriceBelowMinimum,

    #[msg("Insufficient funds")]
    InsufficientFunds,

    #[msg("Listing has expired")]
    ListingExpired,
}
