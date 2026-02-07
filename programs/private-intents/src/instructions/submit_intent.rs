use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::state::{IntentType, IntentStatus, CollateralSource};
use crate::error::PrivateIntentError;

pub fn handler(
    ctx: Context<crate::SubmitIntent>,
    intent_id: u64,
    intent_type: IntentType,
    collateral_amount: u64,
    encrypted_payload: Vec<u8>,
    user_encryption_pubkey: Vec<u8>,
) -> Result<()> {
    let solver_config = &ctx.accounts.solver_config;
    let clock = Clock::get()?;

    // Validate inputs
    require!(solver_config.is_active, PrivateIntentError::SolverNotActive);
    require!(
        collateral_amount >= solver_config.min_collateral,
        PrivateIntentError::InvalidCollateralAmount
    );
    require!(
        encrypted_payload.len() <= solver_config.max_payload_size as usize,
        PrivateIntentError::InvalidPayloadLength
    );
    require!(
        encrypted_payload.len() >= 40, // Minimum encrypted payload size
        PrivateIntentError::InvalidPayloadLength
    );
    require!(
        user_encryption_pubkey.len() == 32,
        PrivateIntentError::InvalidEncryptionPubkey
    );

    // Transfer collateral to intent vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_collateral.to_account_info(),
            to: ctx.accounts.intent_vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, collateral_amount)?;

    // Initialize intent account
    let intent = &mut ctx.accounts.intent;
    intent.owner = ctx.accounts.owner.key();
    intent.intent_id = intent_id;
    intent.intent_type = intent_type;
    intent.target_pool = ctx.accounts.target_pool.key();
    intent.collateral_mint = ctx.accounts.collateral_mint.key();
    intent.collateral_amount = collateral_amount;
    intent.collateral_source = CollateralSource::Native;
    intent.vaa_hash = Vec::new();
    intent.encrypted_payload = encrypted_payload;
    intent.user_encryption_pubkey = user_encryption_pubkey;
    intent.status = IntentStatus::Pending;
    intent.created_at = clock.unix_timestamp;
    intent.executed_at = 0;
    intent.executed_by = None;
    intent.result_position = None;
    intent.bump = ctx.bumps.intent;

    msg!("Intent {} submitted by {}", intent_id, ctx.accounts.owner.key());
    Ok(())
}
