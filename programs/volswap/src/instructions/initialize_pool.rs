use anchor_lang::prelude::*;
use crate::{InitializePool, PoolParams, VolswapError};

pub fn handler(ctx: Context<InitializePool>, params: PoolParams) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Validate parameters
    require!(params.epoch_duration_seconds >= 1, VolswapError::EpochTooShort);
    require!(params.min_notional > 0, VolswapError::NotionalTooLow);
    require!(params.max_notional > params.min_notional, VolswapError::NotionalTooHigh);
    require!(params.fee_rate_bps <= 1000, VolswapError::InvalidFeeRate); // Max 10%
    require!(params.initial_strike_variance_bps > 0, VolswapError::InvalidStrikeVariance);
    require!(params.variance_cap_bps > 0, VolswapError::InvalidVarianceCap);
    require!(params.early_exit_penalty_bps <= 5000, VolswapError::InvalidEarlyExitPenalty); // Max 50%

    // Core settings
    pool.authority = ctx.accounts.authority.key();
    pool.collateral_mint = ctx.accounts.collateral_mint.key();
    pool.underlying_mint = ctx.accounts.underlying_mint.key();
    pool.price_feed = ctx.accounts.price_feed.key();
    pool.variance_tracker = ctx.accounts.variance_tracker.key();

    // Pool parameters
    pool.epoch_duration_seconds = params.epoch_duration_seconds;
    pool.min_notional = params.min_notional;
    pool.max_notional = params.max_notional;
    pool.fee_rate_bps = params.fee_rate_bps;
    pool.variance_cap_bps = params.variance_cap_bps;
    pool.early_exit_penalty_bps = params.early_exit_penalty_bps;

    // Initialize first epoch
    pool.current_epoch = 1;
    pool.epoch_start_time = clock.unix_timestamp;
    pool.epoch_end_time = clock.unix_timestamp + params.epoch_duration_seconds as i64;
    pool.strike_variance_bps = params.initial_strike_variance_bps;
    pool.realized_variance_bps = 0;
    pool.is_epoch_settled = false;

    // Initialize statistics
    pool.total_long_notional = 0;
    pool.total_short_notional = 0;
    pool.active_positions = 0;
    pool.total_fees_collected = 0;
    pool.total_volume = 0;
    pool.total_epochs = 0;

    // Initialize liquidity pool
    pool.total_lp_shares = 0;
    pool.total_liquidity = 0;
    pool.accumulated_lp_fees = 0;

    // State
    pool.is_active = true;
    pool.is_paused = false;
    pool.bump = ctx.bumps.pool;
    pool.vault_bump = ctx.bumps.pool_vault;

    msg!("VolSwap pool initialized");
    msg!("Underlying: {:?}", pool.underlying_mint);
    msg!("Epoch duration: {} seconds", params.epoch_duration_seconds);
    msg!("Strike variance: {} bps", params.initial_strike_variance_bps);
    msg!("Variance cap: {} bps", params.variance_cap_bps);
    msg!("Early exit penalty: {} bps", params.early_exit_penalty_bps);

    Ok(())
}
