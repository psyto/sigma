use anchor_lang::prelude::*;

use crate::{
    errors::OracleError,
    state::FundingRateSample,
    InitializeFundingFeed, RecordFundingRate, UpdateFundingFeed,
};

/// Initialize funding rate feed for a perpetual market
pub fn initialize_funding_feed(
    ctx: Context<InitializeFundingFeed>,
    market_symbol: String,
    funding_interval_seconds: u64,
) -> Result<()> {
    let feed = &mut ctx.accounts.funding_feed;
    let clock = Clock::get()?;

    // Validate inputs
    require!(market_symbol.len() <= 16, OracleError::SymbolTooLong);
    require!(
        funding_interval_seconds >= 3600, // Minimum 1 hour
        OracleError::FundingIntervalTooShort
    );

    // Initialize funding feed
    feed.authority = ctx.accounts.authority.key();
    feed.market_symbol = market_symbol.clone();
    feed.current_rate_bps = 0;
    feed.cumulative_funding = 0;
    feed.funding_interval_seconds = funding_interval_seconds;
    feed.last_update = clock.unix_timestamp;
    feed.total_periods = 0;
    feed.rate_history = Vec::new();
    feed.is_active = true;
    feed.bump = ctx.bumps.funding_feed;

    msg!("Funding feed initialized for {}", market_symbol);
    Ok(())
}

/// Record funding rate from authorized oracle
pub fn record_funding_rate(ctx: Context<RecordFundingRate>, rate_bps: i64) -> Result<()> {
    let feed = &mut ctx.accounts.funding_feed;
    let clock = Clock::get()?;

    // Validate rate (typical range: -1000 to +1000 bps, but allow wider for edge cases)
    require!(
        rate_bps >= -10000 && rate_bps <= 10000,
        OracleError::FundingRateOutOfRange
    );

    // Update current rate
    feed.current_rate_bps = rate_bps;
    feed.last_update = clock.unix_timestamp;
    feed.total_periods += 1;

    // Update cumulative funding (scaled by 1e9 for precision)
    // Cumulative = sum of all rates
    feed.cumulative_funding += (rate_bps as i128) * 1_000_000;

    // Add to history
    feed.rate_history.push(FundingRateSample {
        rate_bps,
        timestamp: clock.unix_timestamp,
    });

    // Keep last 168 periods (1 week of hourly)
    if feed.rate_history.len() > 168 {
        feed.rate_history.remove(0);
    }

    // Log stats
    let avg_rate = feed.calculate_average_rate();
    let volatility = feed.calculate_rate_volatility();
    let annualized = feed.calculate_annualized_rate();

    msg!(
        "Funding rate recorded: {} bps | Avg: {} bps | Vol: {} bps | Ann: {} bps",
        rate_bps,
        avg_rate,
        volatility,
        annualized
    );

    Ok(())
}

/// Update funding feed configuration
pub fn update_funding_feed(
    ctx: Context<UpdateFundingFeed>,
    new_interval: Option<u64>,
    is_active: Option<bool>,
) -> Result<()> {
    let feed = &mut ctx.accounts.funding_feed;

    if let Some(interval) = new_interval {
        require!(interval >= 3600, OracleError::FundingIntervalTooShort);
        feed.funding_interval_seconds = interval;
        msg!("Funding interval updated to {} seconds", interval);
    }

    if let Some(active) = is_active {
        feed.is_active = active;
        msg!("Funding feed active status: {}", active);
    }

    Ok(())
}
