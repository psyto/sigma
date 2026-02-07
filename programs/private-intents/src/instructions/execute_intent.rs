use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use crate::state::{SolverConfig, EncryptedIntent, IntentStatus};
use crate::error::PrivateIntentError;

/// Execute a private intent
/// The solver decrypts the payload off-chain and provides the decrypted parameters
/// for on-chain validation and execution via CPI to the target program
pub fn handler(
    ctx: Context<ExecuteIntent>,
    // Decrypted parameters for validation
    deadline: i64,
    slippage_bps: u16,
    // Execution results
    result_position: Pubkey,
) -> Result<()> {
    let clock = Clock::get()?;

    // Verify deadline hasn't passed
    require!(clock.unix_timestamp <= deadline, PrivateIntentError::IntentExpired);

    // Mark as executing
    let intent = &mut ctx.accounts.intent;
    intent.status = IntentStatus::Executing;

    // The actual CPI to volswap/funding-swap/exotic-vault happens here
    // The solver needs to include the appropriate remaining accounts for CPI
    // For now, we just mark the intent as completed with the result position

    // Update intent state
    intent.status = IntentStatus::Completed;
    intent.executed_at = clock.unix_timestamp;
    intent.executed_by = Some(ctx.accounts.solver.key());
    intent.result_position = Some(result_position);

    // Update solver stats
    let solver_config = &mut ctx.accounts.solver_config;
    solver_config.total_intents = solver_config.total_intents.checked_add(1)
        .ok_or(PrivateIntentError::ArithmeticOverflow)?;
    solver_config.total_volume = solver_config.total_volume
        .checked_add(intent.collateral_amount as u128)
        .ok_or(PrivateIntentError::ArithmeticOverflow)?;

    msg!(
        "Intent {} executed by solver, result position: {}",
        intent.intent_id,
        result_position
    );
    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteIntent<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,

    #[account(
        mut,
        seeds = [SolverConfig::SEED],
        bump = solver_config.bump,
        constraint = solver_config.is_active @ PrivateIntentError::SolverNotActive,
        constraint = solver_config.solver_pubkey == solver.key() @ PrivateIntentError::UnauthorizedSolver
    )]
    pub solver_config: Account<'info, SolverConfig>,

    #[account(
        mut,
        seeds = [EncryptedIntent::SEED, intent.owner.as_ref(), &intent.intent_id.to_le_bytes()],
        bump = intent.bump,
        constraint = intent.is_executable() @ PrivateIntentError::IntentNotExecutable
    )]
    pub intent: Account<'info, EncryptedIntent>,

    /// Target pool for execution
    /// CHECK: Validated against intent.target_pool
    #[account(
        constraint = target_pool.key() == intent.target_pool @ PrivateIntentError::InvalidTargetPool
    )]
    pub target_pool: AccountInfo<'info>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"intent_vault", intent.key().as_ref()],
        bump,
        constraint = intent_vault.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint
    )]
    pub intent_vault: Account<'info, TokenAccount>,

    /// Solver's token account to receive collateral for CPI
    #[account(
        mut,
        constraint = solver_collateral.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint,
        constraint = solver_collateral.owner == solver.key() @ PrivateIntentError::UnauthorizedSolver
    )]
    pub solver_collateral: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
