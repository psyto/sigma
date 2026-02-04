use anchor_lang::prelude::*;
use crate::{ProcessFundingPeriod, FundingSwapError};

/// Read funding rate from FundingFeed account
/// Returns rate in basis points (can be negative)
fn read_funding_rate_from_feed(funding_feed: &AccountInfo) -> Result<i16> {
    // The FundingFeed account data layout (after 8-byte discriminator):
    // - authority: Pubkey (32 bytes)
    // - market_symbol: String (4 bytes len + 16 bytes max)
    // - funding_period_seconds: u64 (8 bytes)
    // - current_rate_bps: i16 (2 bytes) <- This is what we need
    // ... more fields

    let data = funding_feed.try_borrow_data()?;

    // Ensure account has enough data
    // Skip: discriminator (8) + authority (32) + string (4 + 16) + funding_period (8) = 68
    require!(data.len() >= 68 + 2, FundingSwapError::OracleReadError);

    let offset = 8 + 32 + 4 + 16 + 8; // = 68

    // Read current_rate_bps as i16 (little-endian)
    let rate_bytes: [u8; 2] = data[offset..offset + 2]
        .try_into()
        .map_err(|_| FundingSwapError::OracleReadError)?;

    let rate = i16::from_le_bytes(rate_bytes);

    // Sanity check: rate should be reasonable (-1000 to 1000 bps = -10% to 10%)
    require!(rate >= -1000 && rate <= 1000, FundingSwapError::InvalidRate);

    Ok(rate)
}

pub fn handler(ctx: Context<ProcessFundingPeriod>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Check if funding period is due
    require!(
        pool.is_funding_due(clock.unix_timestamp),
        FundingSwapError::FundingNotDue
    );

    // Read actual funding rate from shared oracle
    let actual_rate_bps = read_funding_rate_from_feed(&ctx.accounts.funding_feed)?;

    // Update pool state
    pool.last_funding_time = clock.unix_timestamp;
    pool.current_period = pool.current_period.checked_add(1).ok_or(FundingSwapError::Overflow)?;
    pool.last_actual_rate_bps = actual_rate_bps;
    pool.total_periods_processed = pool.total_periods_processed.checked_add(1).ok_or(FundingSwapError::Overflow)?;

    // Adjust market-making fixed rate based on imbalance
    let rate_adjustment = pool.calculate_rate_adjustment();
    let new_rate = pool.current_fixed_rate_bps.saturating_add(rate_adjustment);
    pool.current_fixed_rate_bps = new_rate;

    msg!("Funding period {} processed", pool.current_period);
    msg!("Actual rate from oracle: {} bps", actual_rate_bps);
    msg!("New fixed rate: {} bps (adjustment: {})", new_rate, rate_adjustment);

    // Log P&L direction
    let rate_diff = actual_rate_bps - pool.current_fixed_rate_bps;
    if rate_diff > 0 {
        msg!("Receivers profit this period");
    } else if rate_diff < 0 {
        msg!("Payers profit this period");
    } else {
        msg!("Breakeven this period");
    }

    Ok(())
}
