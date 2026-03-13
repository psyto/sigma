use anchor_lang::prelude::*;
use crate::error::PrivateIntentError;

pub fn handler(
    ctx: Context<crate::InitializeSolver>,
    solver_pubkey: Pubkey,
    fee_bps: u16,
    min_collateral: u64,
    max_payload_size: u16,
) -> Result<()> {
    let solver_config = &mut ctx.accounts.solver_config;

    // Validate parameters
    require!(fee_bps <= 1000, PrivateIntentError::InvalidFeeRate); // Max 10% solver fee
    require!(min_collateral > 0, PrivateIntentError::InvalidCollateralAmount);
    require!(max_payload_size >= 40, PrivateIntentError::InvalidPayloadLength); // Must allow minimum payload

    solver_config.authority = ctx.accounts.authority.key();
    solver_config.solver_pubkey = solver_pubkey;
    solver_config.fee_bps = fee_bps;
    solver_config.total_intents = 0;
    solver_config.total_volume = 0;
    solver_config.is_active = true;
    solver_config.min_collateral = min_collateral;
    solver_config.max_payload_size = max_payload_size;
    solver_config.bump = ctx.bumps.solver_config;

    msg!("Solver initialized: {}", solver_pubkey);

    emit!(crate::SolverInitialized {
        authority: ctx.accounts.authority.key(),
        solver_pubkey,
        fee_bps,
        min_collateral,
    });

    Ok(())
}
