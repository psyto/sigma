use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, CloseAccount};
use crate::state::{EncryptedIntent, IntentStatus};

/// Cancel a pending intent and reclaim collateral
pub fn handler(ctx: Context<crate::CancelIntent>) -> Result<()> {
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

    emit!(crate::IntentCancelled {
        owner: ctx.accounts.owner.key(),
        intent_id: intent.intent_id,
        collateral_returned: vault_balance,
    });

    Ok(())
}
