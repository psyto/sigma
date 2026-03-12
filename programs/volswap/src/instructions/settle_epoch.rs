use anchor_lang::prelude::*;
use crate::{SettleEpoch, VolswapError};

/// Read realized variance from VarianceTracker account
/// Returns variance in basis points
fn read_variance_from_tracker(variance_tracker: &AccountInfo) -> Result<u64> {
    // The VarianceTracker account data layout (after 8-byte discriminator):
    // - price_feed: Pubkey (32 bytes)
    // - authority: Pubkey (32 bytes)
    // - current_epoch: u64 (8 bytes)
    // - epoch_duration_seconds: u64 (8 bytes)
    // - epoch_start_time: i64 (8 bytes)
    // - current_epoch_variance: u64 (8 bytes) <- This is what we need

    let data = variance_tracker.try_borrow_data()?;

    // Ensure account has enough data
    require!(data.len() >= 8 + 32 + 32 + 8 + 8 + 8 + 8, VolswapError::OracleReadError);

    // Skip discriminator (8) + price_feed (32) + authority (32) + current_epoch (8) + epoch_duration_seconds (8) + epoch_start_time (8)
    // = offset 96
    let offset = 8 + 32 + 32 + 8 + 8 + 8;

    // Read current_epoch_variance as u64 (little-endian)
    let variance_bytes: [u8; 8] = data[offset..offset + 8]
        .try_into()
        .map_err(|_| VolswapError::OracleReadError)?;

    let variance = u64::from_le_bytes(variance_bytes);

    // Sanity check: variance should be reasonable (0 to 100000 bps = 1000%)
    require!(variance <= 100000, VolswapError::InvalidOracle);

    Ok(variance)
}

pub fn handler(ctx: Context<SettleEpoch>) -> Result<()> {
    let pool_key = ctx.accounts.pool.key();
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Validations
    require!(!pool.is_epoch_settled, VolswapError::EpochAlreadySettled);
    require!(clock.unix_timestamp >= pool.epoch_end_time, VolswapError::EpochNotEnded);

    // Read realized variance from shared oracle's VarianceTracker
    let realized_variance_bps = read_variance_from_tracker(&ctx.accounts.variance_tracker)?;

    // Cap variance for risk management
    let capped_variance = std::cmp::min(realized_variance_bps, pool.variance_cap_bps);

    pool.realized_variance_bps = capped_variance;
    pool.is_epoch_settled = true;
    pool.total_epochs = pool.total_epochs.checked_add(1).ok_or(VolswapError::Overflow)?;

    msg!("Epoch {} settled", pool.current_epoch);
    msg!("Strike variance: {} bps", pool.strike_variance_bps);
    msg!("Realized variance: {} bps (raw: {})", capped_variance, realized_variance_bps);

    let variance_diff = capped_variance as i64 - pool.strike_variance_bps as i64;
    if variance_diff > 0 {
        msg!("Longs profit: +{} bps", variance_diff);
    } else if variance_diff < 0 {
        msg!("Shorts profit: +{} bps", -variance_diff);
    } else {
        msg!("Breakeven: no P&L");
    }

    emit!(crate::EpochSettled {
        pool: pool_key,
        epoch: pool.current_epoch,
        strike_variance_bps: pool.strike_variance_bps,
        realized_variance_bps: pool.realized_variance_bps,
    });

    Ok(())
}
