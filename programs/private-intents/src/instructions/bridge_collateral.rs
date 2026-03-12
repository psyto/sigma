use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
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
    // Ensure vaa_hash is not all zeros (i.e., actually contains a hash)
    require!(
        vaa_hash.iter().any(|&b| b != 0),
        PrivateIntentError::InvalidVaa
    );
    require!(
        source_chain != CollateralSource::Native,
        PrivateIntentError::InvalidVaa
    );

    // Verify the Wormhole VAA has been posted and verified on-chain.
    // The client must call postVaa on the Wormhole Core Bridge before invoking
    // this instruction. We verify the posted_vaa account is owned by the
    // Wormhole program, is initialized, and its hash matches the provided vaa_hash.
    //
    // The Wormhole Core Bridge program verifies guardian signatures when the VAA
    // is posted (via verify_signatures + post_vaa). By checking the posted_vaa
    // account here, we transitively verify that the guardians attested this message.

    // 1. Verify the posted_vaa account is owned by the Wormhole program
    let wormhole_program_id = ctx.accounts.wormhole_program.key();
    require!(
        ctx.accounts.posted_vaa.owner == &wormhole_program_id,
        PrivateIntentError::InvalidVaa
    );

    // 2. Verify the posted_vaa account has data (is initialized)
    let posted_vaa_data = ctx.accounts.posted_vaa.try_borrow_data()?;
    require!(
        posted_vaa_data.len() > 0,
        PrivateIntentError::InvalidVaa
    );

    // 3. Verify the vaa_hash matches the posted VAA account's derivation
    //    The posted VAA PDA is derived as ["PostedVAA", vaa_hash] under the
    //    Wormhole Core Bridge program. We re-derive and compare.
    let (expected_posted_vaa, _bump) = Pubkey::find_program_address(
        &[b"PostedVAA", &vaa_hash],
        &wormhole_program_id,
    );
    require!(
        expected_posted_vaa == ctx.accounts.posted_vaa.key(),
        PrivateIntentError::InvalidVaa
    );
    drop(posted_vaa_data);

    // Verify sufficient bridged collateral before transferring
    require!(
        ctx.accounts.bridged_collateral.amount >= collateral_amount,
        PrivateIntentError::InsufficientCollateral
    );

    // Transfer bridged collateral to intent vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.bridged_collateral.to_account_info(),
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

    emit!(crate::CrossChainIntentSubmitted {
        owner: ctx.accounts.owner.key(),
        intent_id,
        intent_type: intent_type as u8,
        collateral_amount,
        source_chain: source_chain as u8,
    });

    Ok(())
}
