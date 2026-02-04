use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use crate::{CloseSwapEarly, FundingSwapError};

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

pub fn handler(ctx: Context<CloseSwapEarly>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let swap = &ctx.accounts.swap;

    // Cannot close after swap has ended
    require!(!swap.has_ended(pool.current_period), FundingSwapError::SwapNotEnded);

    // Calculate refund with early exit penalty
    let refund = pool.calculate_early_exit_refund(swap, pool.current_period);

    // Update pool state
    if swap.is_receiver {
        pool.total_receiver_notional = pool.total_receiver_notional.saturating_sub(swap.notional);
    } else {
        pool.total_payer_notional = pool.total_payer_notional.saturating_sub(swap.notional);
    }
    pool.active_swaps = pool.active_swaps.saturating_sub(1);

    // Transfer refund to user
    if refund > 0 {
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
            refund,
            signer_seeds,
        )?;
    }

    // Remaining collateral stays in pool (penalty goes to LPs)
    let penalty = swap.collateral_deposited.saturating_sub(refund);
    if penalty > 0 {
        pool.accumulated_lp_fees = pool.accumulated_lp_fees.checked_add(penalty).ok_or(FundingSwapError::Overflow)?;
    }

    msg!("Swap closed early");
    msg!("Collateral: {}, Refund: {}, Penalty: {}", swap.collateral_deposited, refund, penalty);

    // Swap account will be closed via the close = user constraint
    Ok(())
}
