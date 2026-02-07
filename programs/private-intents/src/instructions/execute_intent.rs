use anchor_lang::prelude::*;
use crate::state::IntentStatus;
use crate::error::PrivateIntentError;

/// Execute a private intent
/// The solver decrypts the payload off-chain and provides the decrypted parameters
/// for on-chain validation and execution via CPI to the target program
pub fn handler(
    ctx: Context<crate::ExecuteIntent>,
    // Decrypted parameters for validation
    deadline: i64,
    _slippage_bps: u16,
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
