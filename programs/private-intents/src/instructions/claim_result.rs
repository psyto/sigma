use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::EncryptedIntent;
use crate::error::PrivateIntentError;

/// Claim the result of a successfully executed intent
/// The result position has already been created during execution
/// This instruction just closes the intent account and returns rent
pub fn handler(ctx: Context<ClaimResult>) -> Result<()> {
    let intent = &ctx.accounts.intent;

    msg!(
        "Intent {} claimed, result position: {:?}",
        intent.intent_id,
        intent.result_position
    );

    // Intent account will be closed via the `close = owner` constraint
    // Rent will be returned to owner
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimResult<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [EncryptedIntent::SEED, owner.key().as_ref(), &intent.intent_id.to_le_bytes()],
        bump = intent.bump,
        constraint = intent.owner == owner.key() @ PrivateIntentError::UnauthorizedOwner,
        constraint = intent.is_claimable() @ PrivateIntentError::IntentNotExecutable,
        close = owner
    )]
    pub intent: Account<'info, EncryptedIntent>,

    pub system_program: Program<'info, System>,
}
