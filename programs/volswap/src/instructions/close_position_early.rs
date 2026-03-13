use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use crate::{ClosePositionEarly, VolswapError};

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

pub fn handler(ctx: Context<ClosePositionEarly>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let position = &ctx.accounts.position;
    let clock = Clock::get()?;

    // Cannot close after epoch ends
    require!(clock.unix_timestamp < pool.epoch_end_time, VolswapError::EpochNotActive);

    // Calculate refund with early exit penalty
    let refund = pool.calculate_early_exit_refund(position, clock.unix_timestamp);

    // Update pool state
    if position.is_long {
        pool.total_long_notional = pool.total_long_notional.saturating_sub(position.notional);
    } else {
        pool.total_short_notional = pool.total_short_notional.saturating_sub(position.notional);
    }
    pool.active_positions = pool.active_positions.saturating_sub(1);

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
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.pool_vault.to_account_info(),
            &ctx.accounts.user_collateral.to_account_info(),
            &ctx.accounts.pool_vault.to_account_info(),
            refund,
            signer_seeds,
        )?;
    }

    // Remaining collateral stays in pool (penalty goes to LPs)
    let penalty = position.collateral_deposited.saturating_sub(refund);
    if penalty > 0 {
        pool.accumulated_lp_fees = pool.accumulated_lp_fees.checked_add(penalty).ok_or(VolswapError::Overflow)?;
    }

    msg!("Position closed early");
    msg!("Collateral: {}, Refund: {}, Penalty: {}", position.collateral_deposited, refund, penalty);

    emit!(crate::PositionClosedEarly {
        pool: ctx.accounts.pool.key(),
        owner: ctx.accounts.user.key(),
        position: ctx.accounts.position.key(),
        refund,
        penalty,
    });

    // Position account will be closed via the close = user constraint
    Ok(())
}
