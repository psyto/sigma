use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use crate::{ClaimPayout, ExoticVaultError, state::OptionStatus};

/// SPL Token transfer with PDA signer
fn spl_token_transfer_signed<'info>(
    token_program: &AccountInfo<'info>,
    source: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = spl_token::instruction::transfer(
        token_program.key,
        source.key,
        destination.key,
        authority.key,
        &[],
        amount,
    )?;

    invoke_signed(
        &ix,
        &[
            source.clone(),
            destination.clone(),
            authority.clone(),
            token_program.clone(),
        ],
        signer_seeds,
    )?;

    Ok(())
}

pub fn handler(ctx: Context<ClaimPayout>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let option = &mut ctx.accounts.option;

    let payout = option.payout_amount;
    option.status = OptionStatus::Claimed;

    // Transfer payout
    if payout > 0 {
        let vault_key = vault.key();
        let seeds = &[
            b"vault_collateral",
            vault_key.as_ref(),
            &[vault.collateral_vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        spl_token_transfer_signed(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_collateral,
            &ctx.accounts.user_collateral,
            &ctx.accounts.vault_collateral,
            payout,
            signer_seeds,
        )?;
    }

    msg!("Payout claimed: {}", payout);

    Ok(())
}
