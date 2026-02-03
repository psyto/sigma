use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};
use crate::{ClaimPayout, ExoticVaultError, state::OptionStatus};

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

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_collateral.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.user_collateral.to_account_info(),
                    authority: ctx.accounts.vault_collateral.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
            ctx.accounts.collateral_mint.decimals,
        )?;
    }

    msg!("Payout claimed: {}", payout);

    Ok(())
}
