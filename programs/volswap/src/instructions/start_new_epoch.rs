use anchor_lang::prelude::*;
use crate::{StartNewEpoch, VolswapError};

pub fn handler(ctx: Context<StartNewEpoch>, strike_variance_bps: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Validations
    require!(pool.is_epoch_settled, VolswapError::EpochNotActive);
    require!(strike_variance_bps > 0, VolswapError::InvalidStrikeVariance);

    // Start new epoch
    pool.current_epoch = pool.current_epoch.checked_add(1).ok_or(VolswapError::Overflow)?;
    pool.epoch_start_time = clock.unix_timestamp;
    pool.epoch_end_time = clock.unix_timestamp + pool.epoch_duration_seconds as i64;
    pool.strike_variance_bps = strike_variance_bps;
    pool.realized_variance_bps = 0;
    pool.is_epoch_settled = false;

    // Reset epoch-specific stats
    pool.total_long_notional = 0;
    pool.total_short_notional = 0;

    msg!("New epoch {} started", pool.current_epoch);
    msg!("Strike variance: {} bps", strike_variance_bps);
    msg!("Ends at: {}", pool.epoch_end_time);

    Ok(())
}
