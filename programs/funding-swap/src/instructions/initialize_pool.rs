use anchor_lang::prelude::*;
use crate::{InitializePool, PoolParams, FundingSwapError};

pub fn handler(ctx: Context<InitializePool>, params: PoolParams) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Validate parameters
    require!(
        !params.market_symbol.is_empty() && params.market_symbol.len() <= 16,
        FundingSwapError::InvalidMarketSymbol
    );
    require!(params.funding_period_seconds >= 3600, FundingSwapError::InvalidFundingPeriod); // Min 1 hour
    require!(params.min_notional > 0, FundingSwapError::NotionalTooLow);
    require!(params.max_notional > params.min_notional, FundingSwapError::NotionalTooHigh);
    require!(params.max_duration_periods >= 1, FundingSwapError::DurationTooShort);
    require!(params.fee_rate_bps <= 500, FundingSwapError::InvalidFeeRate); // Max 5%
    require!(params.early_exit_penalty_bps <= 5000, FundingSwapError::InvalidEarlyExitPenalty); // Max 50%

    // Core settings
    pool.authority = ctx.accounts.authority.key();
    pool.market_symbol = params.market_symbol.clone();
    pool.collateral_mint = ctx.accounts.collateral_mint.key();
    pool.funding_feed = ctx.accounts.funding_feed.key();

    // Pool parameters
    pool.funding_period_seconds = params.funding_period_seconds;
    pool.min_notional = params.min_notional;
    pool.max_notional = params.max_notional;
    pool.max_duration_periods = params.max_duration_periods;
    pool.fee_rate_bps = params.fee_rate_bps;
    pool.early_exit_penalty_bps = params.early_exit_penalty_bps;

    // Current state
    pool.current_fixed_rate_bps = params.initial_fixed_rate_bps;
    pool.last_funding_time = clock.unix_timestamp;
    pool.current_period = 0;
    pool.last_actual_rate_bps = 0;

    // Statistics
    pool.total_receiver_notional = 0;
    pool.total_payer_notional = 0;
    pool.active_swaps = 0;
    pool.total_swaps = 0;
    pool.total_volume = 0;
    pool.total_fees_collected = 0;
    pool.total_periods_processed = 0;

    // Liquidity pool
    pool.total_lp_shares = 0;
    pool.total_liquidity = 0;
    pool.accumulated_lp_fees = 0;

    // State
    pool.is_active = true;
    pool.is_paused = false;
    pool.bump = ctx.bumps.pool;
    pool.vault_bump = ctx.bumps.pool_vault;

    msg!("FundingSwap pool initialized for {}", params.market_symbol);
    msg!("Funding period: {} seconds", params.funding_period_seconds);
    msg!("Initial fixed rate: {} bps", params.initial_fixed_rate_bps);
    msg!("Early exit penalty: {} bps", params.early_exit_penalty_bps);

    Ok(())
}
