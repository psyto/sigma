use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};
use crate::{ClaimPayout, VolswapError, state::PositionStatus};

pub fn handler(ctx: Context<ClaimPayout>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    // Calculate P&L
    let pnl = pool.calculate_pnl(position);
    position.settlement_pnl = pnl;

    // Calculate payout: collateral + P&L (clamped to 0)
    let payout = if pnl >= 0 {
        position.collateral_deposited.checked_add(pnl as u64).ok_or(VolswapError::Overflow)?
    } else {
        position.collateral_deposited.saturating_sub((-pnl) as u64)
    };

    position.payout_amount = payout;
    position.status = PositionStatus::Claimed;
    position.settled_at = Some(clock.unix_timestamp);

    // Transfer payout to user
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

    msg!("Payout claimed: {} (P&L: {})", payout, pnl);

    Ok(())
}
