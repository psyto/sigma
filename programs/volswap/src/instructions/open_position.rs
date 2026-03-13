use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use crate::{OpenPosition, VolswapError, state::PositionStatus};

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
    ctx: Context<OpenPosition>,
    notional: u64,
    premium_limit: u64,
    is_long: bool,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    // Validations
    require!(pool.is_active, VolswapError::PoolInactive);
    require!(!pool.is_paused, VolswapError::PoolPaused);
    require!(!pool.is_epoch_settled, VolswapError::EpochNotActive);
    require!(clock.unix_timestamp < pool.epoch_end_time, VolswapError::EpochNotActive);
    require!(notional >= pool.min_notional, VolswapError::NotionalTooLow);
    require!(notional <= pool.max_notional, VolswapError::NotionalTooHigh);

    // Calculate premium
    let premium = pool.calculate_premium(notional, is_long);

    if is_long {
        require!(premium <= premium_limit, VolswapError::PremiumExceedsLimit);
    } else {
        require!(premium >= premium_limit, VolswapError::PremiumBelowMinimum);
    }

    // Calculate required collateral using pool method
    let margin = pool.calculate_margin(notional, is_long);

    let collateral_required = if is_long {
        premium.checked_add(margin).ok_or(VolswapError::Overflow)?
    } else {
        margin.saturating_sub(premium)
    };

    // Transfer collateral from user to vault
    spl_token_transfer(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.user_collateral.to_account_info(),
        &ctx.accounts.pool_vault.to_account_info(),
        &ctx.accounts.user.to_account_info(),
        collateral_required,
    )?;

    // Calculate and collect fee
    let fee = (notional * pool.fee_rate_bps as u64) / 10000;
    pool.total_fees_collected = pool.total_fees_collected.checked_add(fee).ok_or(VolswapError::Overflow)?;
    pool.accumulated_lp_fees = pool.accumulated_lp_fees.checked_add(fee).ok_or(VolswapError::Overflow)?;

    // Update pool state
    if is_long {
        pool.total_long_notional = pool.total_long_notional.checked_add(notional).ok_or(VolswapError::Overflow)?;
    } else {
        pool.total_short_notional = pool.total_short_notional.checked_add(notional).ok_or(VolswapError::Overflow)?;
    }
    pool.total_volume = pool.total_volume.checked_add(notional as u128).ok_or(VolswapError::Overflow)?;
    pool.active_positions = pool.active_positions.checked_add(1).ok_or(VolswapError::Overflow)?;

    // Initialize position
    position.owner = ctx.accounts.user.key();
    position.pool = pool.key();
    position.epoch = pool.current_epoch;
    position.notional = notional;
    position.strike_variance_bps = pool.strike_variance_bps;
    position.is_long = is_long;
    position.collateral_deposited = collateral_required;
    position.premium = premium;
    position.settlement_pnl = 0;
    position.payout_amount = 0;
    position.status = PositionStatus::Active;
    position.opened_at = clock.unix_timestamp;
    position.settled_at = None;
    position.bump = ctx.bumps.position;

    msg!("Position opened: {} {} notional at {} strike",
        if is_long { "LONG" } else { "SHORT" },
        notional,
        pool.strike_variance_bps
    );

    emit!(crate::PositionOpened {
        pool: ctx.accounts.pool.key(),
        owner: ctx.accounts.user.key(),
        position: ctx.accounts.position.key(),
        is_long,
        notional,
        premium,
        strike_variance_bps: ctx.accounts.pool.strike_variance_bps,
        epoch: ctx.accounts.pool.current_epoch,
    });

    Ok(())
}
