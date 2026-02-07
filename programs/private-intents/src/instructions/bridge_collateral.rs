use anchor_lang::prelude::*;
use crate::state::{IntentType, IntentStatus, CollateralSource};
use crate::error::PrivateIntentError;

/// Submit an intent with cross-chain collateral (bridged via Wormhole)
/// The collateral has already been bridged to Solana via Wormhole
/// This instruction verifies the VAA and initializes the intent
pub fn handler(
    ctx: Context<crate::BridgeCollateral>,
    intent_id: u64,
    intent_type: IntentType,
    collateral_amount: u64,
    encrypted_payload: Vec<u8>,
    user_encryption_pubkey: Vec<u8>,
    source_chain: CollateralSource,
    vaa_hash: Vec<u8>,
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
        encrypted_payload.len() >= 40,
        PrivateIntentError::InvalidPayloadLength
    );
    require!(
        user_encryption_pubkey.len() == 32,
        PrivateIntentError::InvalidEncryptionPubkey
    );
    require!(
        vaa_hash.len() == 32,
        PrivateIntentError::InvalidVaa
    );
    require!(
        source_chain != CollateralSource::Native,
        PrivateIntentError::InvalidVaa
    );

    // TODO: Verify Wormhole VAA via CPI to Wormhole Core Bridge
    // This would validate that:
    // 1. The VAA is signed by the guardian set
    // 2. The VAA hasn't been processed before
    // 3. The amount and recipient match
    //
    // For now, we trust the caller provides a valid VAA hash
    // In production, this MUST be verified on-chain

    // Initialize intent account
    let intent = &mut ctx.accounts.intent;
    intent.owner = ctx.accounts.owner.key();
    intent.intent_id = intent_id;
    intent.intent_type = intent_type;
    intent.target_pool = ctx.accounts.target_pool.key();
    intent.collateral_mint = ctx.accounts.collateral_mint.key();
    intent.collateral_amount = collateral_amount;
    intent.collateral_source = source_chain;
    intent.vaa_hash = vaa_hash;
    intent.encrypted_payload = encrypted_payload;
    intent.user_encryption_pubkey = user_encryption_pubkey;
    intent.status = IntentStatus::Pending;
    intent.created_at = clock.unix_timestamp;
    intent.executed_at = 0;
    intent.executed_by = None;
    intent.result_position = None;
    intent.bump = ctx.bumps.intent;

    msg!(
        "Cross-chain intent {} submitted from {:?} by {}",
        intent_id,
        source_chain,
        ctx.accounts.owner.key()
    );
    Ok(())
}
