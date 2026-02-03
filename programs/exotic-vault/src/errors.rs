use anchor_lang::prelude::*;

#[error_code]
pub enum ExoticVaultError {
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Vault is not active")]
    VaultInactive,

    #[msg("Option not settled")]
    NotSettled,

    #[msg("Option already claimed")]
    AlreadyClaimed,

    #[msg("Option already settled")]
    AlreadySettled,

    #[msg("Option not expired")]
    NotExpired,

    #[msg("Option expired")]
    Expired,

    #[msg("Barrier already breached")]
    BarrierAlreadyBreached,

    #[msg("Barrier not breached (for knock-in)")]
    BarrierNotBreached,

    #[msg("Notional below minimum")]
    NotionalTooLow,

    #[msg("Notional above maximum")]
    NotionalTooHigh,

    #[msg("Duration too short")]
    DurationTooShort,

    #[msg("Duration too long")]
    DurationTooLong,

    #[msg("Invalid strike price")]
    InvalidStrikePrice,

    #[msg("Invalid barrier price")]
    InvalidBarrierPrice,

    #[msg("Sample interval not reached")]
    SampleTooSoon,

    #[msg("Invalid fee rate")]
    InvalidFeeRate,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Invalid option type for this operation")]
    InvalidOptionType,
}
