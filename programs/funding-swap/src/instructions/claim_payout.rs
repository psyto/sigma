use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};
use crate::{ClaimPayout, FundingSwapError, state::SwapStatus};

pub fn handler(ctx: Context<ClaimPayout>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let swap = &mut ctx.accounts.swap;

    let payout = swap.payout_amount;
    swap.status = SwapStatus::Claimed;

    // Transfer payout
    if payout > 0 {
        let pool_key = pool.key();
        let seeds = &[
            b"pool_vault",
            pool_key.as_ref(),
            &[pool.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.user_collateral.to_account_info(),
                    authority: ctx.accounts.pool_vault.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
            ctx.accounts.collateral_mint.decimals,
        )?;
    }

    msg!("Payout claimed: {} (P&L: {})", payout, swap.accumulated_pnl);

    Ok(())
}
