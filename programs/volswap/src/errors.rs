use anchor_lang::prelude::*;

#[error_code]
pub enum VolswapError {
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
    // Epoch Errors
    // ============================================================================
    #[msg("Epoch is not active")]
    EpochNotActive,

    #[msg("Epoch not yet ended")]
    EpochNotEnded,

    #[msg("Epoch already settled")]
    EpochAlreadySettled,

    #[msg("Epoch not settled")]
    EpochNotSettled,

    #[msg("Wrong epoch for this position")]
    WrongEpoch,

    #[msg("Epoch duration too short (min 1 day)")]
    EpochTooShort,

    // ============================================================================
    // Position Errors
    // ============================================================================
    #[msg("Position not settled")]
    NotSettled,

    #[msg("Position already settled")]
    AlreadySettled,

    #[msg("Position already claimed")]
    AlreadyClaimed,

    #[msg("Invalid position status")]
    InvalidPositionStatus,

    // ============================================================================
    // Notional Errors
    // ============================================================================
    #[msg("Notional below minimum")]
    NotionalTooLow,

    #[msg("Notional above maximum")]
    NotionalTooHigh,

    // ============================================================================
    // Collateral Errors
    // ============================================================================
    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("Insufficient pool liquidity")]
    InsufficientLiquidity,

    // ============================================================================
    // Premium Errors
    // ============================================================================
    #[msg("Premium exceeds maximum limit")]
    PremiumExceedsLimit,

    #[msg("Premium below minimum threshold")]
    PremiumBelowMinimum,

    // ============================================================================
    // Parameter Errors
    // ============================================================================
    #[msg("Invalid strike variance")]
    InvalidStrikeVariance,

    #[msg("Invalid fee rate (max 10%)")]
    InvalidFeeRate,

    #[msg("Invalid variance cap")]
    InvalidVarianceCap,

    #[msg("Invalid early exit penalty (max 50%)")]
    InvalidEarlyExitPenalty,

    // ============================================================================
    // Oracle Errors
    // ============================================================================
    #[msg("Invalid oracle account")]
    InvalidOracle,

    #[msg("Oracle data is stale")]
    StaleOracleData,

    #[msg("Failed to read variance from oracle")]
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

    #[msg("LP withdrawal is locked during active epoch")]
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
