use anchor_lang::prelude::*;

#[error_code]
pub enum PrivateIntentError {
    #[msg("Solver is not active")]
    SolverNotActive,

    #[msg("Unauthorized - only solver can execute")]
    UnauthorizedSolver,

    #[msg("Unauthorized - only owner can perform this action")]
    UnauthorizedOwner,

    #[msg("Invalid payload length")]
    InvalidPayloadLength,

    #[msg("Invalid collateral amount")]
    InvalidCollateralAmount,

    #[msg("Intent is not pending")]
    IntentNotPending,

    #[msg("Intent is not executable")]
    IntentNotExecutable,

    #[msg("Intent is not cancellable")]
    IntentNotCancellable,

    #[msg("Intent already processed")]
    IntentAlreadyProcessed,

    #[msg("Intent expired")]
    IntentExpired,

    #[msg("Slippage exceeded")]
    SlippageExceeded,

    #[msg("Invalid intent type")]
    InvalidIntentType,

    #[msg("Invalid target pool")]
    InvalidTargetPool,

    #[msg("Bridge pending - cannot cancel")]
    BridgePending,

    #[msg("Invalid VAA")]
    InvalidVaa,

    #[msg("VAA already processed")]
    VaaAlreadyProcessed,

    #[msg("Invalid encryption pubkey")]
    InvalidEncryptionPubkey,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Invalid token mint")]
    InvalidTokenMint,

    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("CPI execution to target program failed")]
    CpiExecutionFailed,

    #[msg("Invalid remaining accounts for CPI dispatch")]
    InvalidRemainingAccounts,
}
