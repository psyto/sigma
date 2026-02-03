use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};
use crate::{OpenPosition, VolswapError, state::PositionStatus};

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

    // Calculate required collateral
    // Longs: premium + margin (20% of notional)
    // Shorts: margin (30% of notional) - they receive premium
    let margin_bps: u64 = if is_long { 2000 } else { 3000 };
    let margin = (notional * margin_bps) / 10000;

    let collateral_required = if is_long {
        premium + margin
    } else {
        margin.saturating_sub(premium)
    };

    // Transfer collateral from user to vault
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_collateral.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.pool_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        collateral_required,
        ctx.accounts.collateral_mint.decimals,
    )?;

    // Calculate and collect fee
    let fee = (notional * pool.fee_rate_bps as u64) / 10000;
    pool.total_fees_collected = pool.total_fees_collected.checked_add(fee).ok_or(VolswapError::Overflow)?;

    // Update pool state
    if is_long {
        pool.total_long_notional = pool.total_long_notional.checked_add(notional).ok_or(VolswapError::Overflow)?;
    } else {
        pool.total_short_notional = pool.total_short_notional.checked_add(notional).ok_or(VolswapError::Overflow)?;
    }
    pool.total_volume = pool.total_volume.checked_add(notional as u128).ok_or(VolswapError::Overflow)?;

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

    Ok(())
}
