use anchor_lang::prelude::*;
use crate::{SettleEpoch, VolswapError};

pub fn handler(ctx: Context<SettleEpoch>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Validations
    require!(!pool.is_epoch_settled, VolswapError::EpochAlreadySettled);
    require!(clock.unix_timestamp >= pool.epoch_end_time, VolswapError::EpochNotEnded);

    // TODO: Read realized variance from shared oracle sample buffer
    // For now, using placeholder - in production this would CPI to shared-oracle
    // and calculate variance from the SampleBuffer

    // Placeholder: simulate realized variance
    // In production: let realized_variance = calculate_variance_from_oracle(&ctx.accounts.sample_buffer);
    let realized_variance_bps: u64 = 4500; // Placeholder: 45% realized vol

    pool.realized_variance_bps = realized_variance_bps;
    pool.is_epoch_settled = true;
    pool.total_epochs = pool.total_epochs.checked_add(1).ok_or(VolswapError::Overflow)?;

    msg!("Epoch {} settled", pool.current_epoch);
    msg!("Strike variance: {} bps", pool.strike_variance_bps);
    msg!("Realized variance: {} bps", realized_variance_bps);

    let variance_diff = realized_variance_bps as i64 - pool.strike_variance_bps as i64;
    if variance_diff > 0 {
        msg!("Longs profit: +{} bps", variance_diff);
    } else {
        msg!("Shorts profit: +{} bps", -variance_diff);
    }

    Ok(())
}
