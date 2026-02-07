use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, CloseAccount, Mint};
use crate::state::{EncryptedIntent, IntentStatus};
use crate::error::PrivateIntentError;

/// Cancel a pending intent and reclaim collateral
pub fn handler(ctx: Context<CancelIntent>) -> Result<()> {
    let intent = &ctx.accounts.intent;

    // Build signer seeds for intent PDA
    let intent_seeds = &[
        EncryptedIntent::SEED,
        intent.owner.as_ref(),
        &intent.intent_id.to_le_bytes(),
        &[intent.bump],
    ];
    let signer_seeds = &[&intent_seeds[..]];

    // Transfer collateral back to user
    let vault_balance = ctx.accounts.intent_vault.amount;
    if vault_balance > 0 {
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.intent_vault.to_account_info(),
                to: ctx.accounts.user_collateral.to_account_info(),
                authority: ctx.accounts.intent.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, vault_balance)?;
    }

    // Close the vault account
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.intent_vault.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.intent.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(close_ctx)?;

    // Update intent status
    let intent = &mut ctx.accounts.intent;
    intent.status = IntentStatus::Cancelled;

    msg!("Intent {} cancelled, {} collateral returned", intent.intent_id, vault_balance);
    Ok(())
}

#[derive(Accounts)]
pub struct CancelIntent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [EncryptedIntent::SEED, owner.key().as_ref(), &intent.intent_id.to_le_bytes()],
        bump = intent.bump,
        constraint = intent.owner == owner.key() @ PrivateIntentError::UnauthorizedOwner,
        constraint = intent.is_cancellable() @ PrivateIntentError::IntentNotCancellable
    )]
    pub intent: Account<'info, EncryptedIntent>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"intent_vault", intent.key().as_ref()],
        bump,
        constraint = intent_vault.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint
    )]
    pub intent_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_collateral.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint,
        constraint = user_collateral.owner == owner.key() @ PrivateIntentError::UnauthorizedOwner
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
