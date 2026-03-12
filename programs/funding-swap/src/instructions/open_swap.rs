use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use crate::{OpenSwap, FundingSwapError, state::SwapStatus};

/// SPL Token transfer instruction
fn spl_token_transfer<'info>(
    token_program: &AccountInfo<'info>,
    source: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let ix = spl_token::instruction::transfer(
        token_program.key,
        source.key,
        destination.key,
        authority.key,
        &[],
        amount,
    )?;

    invoke(
        &ix,
        &[
            source.clone(),
            destination.clone(),
            authority.clone(),
            token_program.clone(),
        ],
    )?;

    Ok(())
}

pub fn handler(
    ctx: Context<OpenSwap>,
    notional: u64,
    duration_periods: u16,
    rate_limit: i16,
    is_receiver: bool,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let swap = &mut ctx.accounts.swap;
    let clock = Clock::get()?;

    // Validations
    require!(pool.is_active, FundingSwapError::PoolInactive);
    require!(!pool.is_paused, FundingSwapError::PoolPaused);
    require!(notional >= pool.min_notional, FundingSwapError::NotionalTooLow);
    require!(notional <= pool.max_notional, FundingSwapError::NotionalTooHigh);
    require!(duration_periods >= 1, FundingSwapError::DurationTooShort);
    require!(duration_periods <= pool.max_duration_periods, FundingSwapError::DurationTooLong);

    // Check rate limits
    let fixed_rate = pool.current_fixed_rate_bps;
    if is_receiver {
        // Receiver wants low fixed rate (they pay fixed)
        require!(fixed_rate <= rate_limit, FundingSwapError::RateExceedsLimit);
    } else {
        // Payer wants high fixed rate (they receive fixed)
        require!(fixed_rate >= rate_limit, FundingSwapError::RateBelowMinimum);
    }

    // Calculate required collateral using pool methods
    let margin = pool.calculate_margin(notional, duration_periods);
    let fee = pool.calculate_fee(notional);
    let collateral_required = margin.checked_add(fee).ok_or(FundingSwapError::Overflow)?;

    // Transfer collateral from user to vault
    spl_token_transfer(
        &ctx.accounts.token_program,
        &ctx.accounts.user_collateral,
        &ctx.accounts.pool_vault,
        &ctx.accounts.user.to_account_info(),
        collateral_required,
    )?;

    // Update pool state
    pool.total_fees_collected = pool.total_fees_collected.checked_add(fee).ok_or(FundingSwapError::Overflow)?;
    pool.accumulated_lp_fees = pool.accumulated_lp_fees.checked_add(fee).ok_or(FundingSwapError::Overflow)?;
    pool.total_volume = pool.total_volume.checked_add(notional as u128).ok_or(FundingSwapError::Overflow)?;

    if is_receiver {
        pool.total_receiver_notional = pool.total_receiver_notional.checked_add(notional).ok_or(FundingSwapError::Overflow)?;
    } else {
        pool.total_payer_notional = pool.total_payer_notional.checked_add(notional).ok_or(FundingSwapError::Overflow)?;
    }

    let swap_index = pool.total_swaps;
    pool.total_swaps = pool.total_swaps.checked_add(1).ok_or(FundingSwapError::Overflow)?;
    pool.active_swaps = pool.active_swaps.checked_add(1).ok_or(FundingSwapError::Overflow)?;

    // Initialize swap
    swap.owner = ctx.accounts.user.key();
    swap.pool = pool.key();
    swap.swap_index = swap_index;
    swap.notional = notional;
    swap.fixed_rate_bps = fixed_rate;
    swap.is_receiver = is_receiver;
    swap.duration_periods = duration_periods;
    swap.start_period = pool.current_period;
    swap.end_period = pool.current_period + duration_periods as u64;
    swap.collateral_deposited = collateral_required;
    swap.accumulated_pnl = 0;
    swap.periods_settled = 0;
    swap.payout_amount = 0;
    swap.status = SwapStatus::Active;
    swap.opened_at = clock.unix_timestamp;
    swap.settled_at = None;
    swap.bump = ctx.bumps.swap;

    msg!("Swap opened: {} {} notional, {} bps fixed, {} periods",
        if is_receiver { "RECEIVER" } else { "PAYER" },
        notional,
        fixed_rate,
        duration_periods
    );

    emit!(crate::SwapOpened {
        pool: pool.key(),
        owner: ctx.accounts.user.key(),
        swap: swap.key(),
        is_receiver,
        notional,
        fixed_rate_bps: fixed_rate,
        duration_periods,
    });

    Ok(())
}
