use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use crate::{ClaimPayout, FundingSwapError, state::SwapStatus};

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
    let pool = &ctx.accounts.pool;
    let swap = &ctx.accounts.swap;

    // Position must be settled
    require!(swap.status == SwapStatus::Settled, FundingSwapError::NotSettled);

    // Get the pre-calculated payout from swap
    let payout = swap.payout_amount;

    // Transfer payout to user
    if payout > 0 {
        let pool_key = pool.key();
        let seeds = &[
            b"pool_vault".as_ref(),
            pool_key.as_ref(),
            &[pool.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        spl_token_transfer_signed(
            &ctx.accounts.token_program,
            &ctx.accounts.pool_vault,
            &ctx.accounts.user_collateral,
            &ctx.accounts.pool_vault,
            payout,
            signer_seeds,
        )?;
    }

    msg!("Payout claimed: {} (P&L: {})", payout, swap.accumulated_pnl);

    emit!(crate::SwapPayoutClaimed {
        pool: pool.key(),
        owner: swap.owner,
        swap: swap.key(),
        amount: payout,
    });

    // Swap account will be closed via the close = user constraint
    Ok(())
}
