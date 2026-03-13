use anchor_lang::prelude::*;

use crate::{
    errors::OracleError,
    state::EpochVariance,
    FinalizeEpochVariance, InitializeVarianceTracker, StartNewVarianceEpoch,
};

/// Initialize variance tracker for an asset
pub fn initialize_variance_tracker(
    ctx: Context<InitializeVarianceTracker>,
    epoch_duration_seconds: u64,
) -> Result<()> {
    let tracker = &mut ctx.accounts.variance_tracker;
    let price_feed = &ctx.accounts.price_feed;
    let clock = Clock::get()?;

    // Validate epoch duration (minimum 1 hour, maximum 30 days)
    require!(
        epoch_duration_seconds >= 3600 && epoch_duration_seconds <= 30 * 24 * 3600,
        OracleError::InvalidEpochDuration
    );

    // Initialize tracker
    tracker.price_feed = price_feed.key();
    tracker.authority = ctx.accounts.authority.key();
    tracker.current_epoch = 0;
    tracker.epoch_duration_seconds = epoch_duration_seconds;
    tracker.epoch_start_time = clock.unix_timestamp;
    tracker.current_epoch_variance = 0;
    tracker.current_epoch_samples = 0;
    tracker.epoch_start_sample_index = 0;
    tracker.epoch_history = Vec::new();
    tracker.is_epoch_finalized = false;
    tracker.bump = ctx.bumps.variance_tracker;

    msg!(
        "Variance tracker initialized for {} with {} second epochs",
        price_feed.asset_symbol,
        epoch_duration_seconds
    );

    Ok(())
}

/// Finalize variance for completed epoch
pub fn finalize_epoch_variance(ctx: Context<FinalizeEpochVariance>) -> Result<()> {
    let tracker_key = ctx.accounts.variance_tracker.key();
    let tracker = &mut ctx.accounts.variance_tracker;
    let price_feed = &ctx.accounts.price_feed;
    let sample_buffer = &ctx.accounts.sample_buffer;
    let clock = Clock::get()?;

    // Check epoch has ended
    require!(
        tracker.is_epoch_ended(clock.unix_timestamp),
        OracleError::EpochNotEnded
    );

    // Check not already finalized
    require!(!tracker.is_epoch_finalized, OracleError::EpochAlreadyFinalized);

    // Calculate epoch end time
    let epoch_end_time = tracker.epoch_start_time + tracker.epoch_duration_seconds as i64;

    // Get samples for this epoch
    let epoch_samples = sample_buffer.get_samples_in_range(tracker.epoch_start_time, epoch_end_time);

    // Need at least 2 samples for variance
    require!(epoch_samples.len() >= 2, OracleError::InsufficientSamples);

    // Calculate realized variance for epoch
    let realized_variance = calculate_epoch_variance(&epoch_samples, price_feed.sample_interval_seconds);

    // Update tracker
    tracker.current_epoch_variance = realized_variance;
    tracker.current_epoch_samples = epoch_samples.len() as u32;
    tracker.is_epoch_finalized = true;

    // Capture values before pushing to history
    let current_epoch = tracker.current_epoch;
    let epoch_start = tracker.epoch_start_time;
    let sample_count = epoch_samples.len() as u32;

    // Add to history
    tracker.epoch_history.push(EpochVariance {
        epoch: current_epoch,
        variance: realized_variance,
        start_time: epoch_start,
        end_time: epoch_end_time,
        sample_count,
    });

    // Keep last 52 epochs (1 year of weekly epochs)
    if tracker.epoch_history.len() > 52 {
        tracker.epoch_history.remove(0);
    }

    msg!(
        "Epoch {} finalized: variance = {} bps ({} samples)",
        tracker.current_epoch,
        realized_variance,
        epoch_samples.len()
    );

    emit!(crate::VarianceFinalized {
        variance_tracker: tracker_key,
        epoch: tracker.current_epoch,
        variance_bps: tracker.current_epoch_variance,
    });

    Ok(())
}

/// Start new variance epoch
pub fn start_new_variance_epoch(ctx: Context<StartNewVarianceEpoch>) -> Result<()> {
    let tracker = &mut ctx.accounts.variance_tracker;
    let clock = Clock::get()?;

    // Previous epoch must be finalized
    require!(tracker.is_epoch_finalized, OracleError::EpochNotFinalized);

    // Increment epoch
    tracker.current_epoch = tracker.current_epoch.checked_add(1).ok_or(OracleError::MathOverflow)?;
    tracker.epoch_start_time = clock.unix_timestamp;
    tracker.current_epoch_variance = 0;
    tracker.current_epoch_samples = 0;
    tracker.is_epoch_finalized = false;

    msg!("New epoch {} started", tracker.current_epoch);

    Ok(())
}

// ============================================================================
// Helper functions
// ============================================================================

use crate::state::PriceSample;

/// Calculate realized variance from a set of samples
fn calculate_epoch_variance(samples: &[PriceSample], interval_seconds: u64) -> u64 {
    if samples.len() < 2 {
        return 0;
    }

    let mut sum_squared_returns: u128 = 0;
    let mut valid_samples = 0u64;

    for i in 1..samples.len() {
        let prev_price = samples[i - 1].price as u128;
        let curr_price = samples[i].price as u128;

        if prev_price == 0 {
            continue;
        }

        // Calculate log return approximation: (P1 - P0) / P0
        // Scaled by 1e8 for precision
        let return_scaled = if curr_price >= prev_price {
            ((curr_price - prev_price) * 100_000_000) / prev_price
        } else {
            ((prev_price - curr_price) * 100_000_000) / prev_price
        };

        sum_squared_returns += return_scaled * return_scaled;
        valid_samples += 1;
    }

    if valid_samples == 0 {
        return 0;
    }

    // Annualize: variance * (seconds_per_year / interval)
    let seconds_per_year: u128 = 365 * 24 * 3600;
    let annualization_factor = seconds_per_year / interval_seconds as u128;

    // Result in basis points
    let variance_bps =
        (sum_squared_returns * annualization_factor) / (valid_samples as u128 * 100_000_000 * 100);

    variance_bps as u64
}
