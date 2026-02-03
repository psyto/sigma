use anchor_lang::prelude::*;

declare_id!("SIGorac1e11111111111111111111111111111111");

pub mod state;
pub mod errors;

use state::*;
use errors::OracleError;

/// Shared Oracle Program for Sigma Protocol
/// Provides price feeds, TWAP calculations, and funding rate data for all derivative protocols
#[program]
pub mod shared_oracle {
    use super::*;

    /// Initialize a new price feed for an asset
    pub fn initialize_price_feed(
        ctx: Context<InitializePriceFeed>,
        asset_symbol: String,
        sample_interval_seconds: u64,
        max_samples: u16,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.price_feed;
        let clock = Clock::get()?;

        require!(asset_symbol.len() <= 16, OracleError::SymbolTooLong);
        require!(sample_interval_seconds >= 60, OracleError::IntervalTooShort);
        require!(max_samples >= 100 && max_samples <= 10000, OracleError::InvalidMaxSamples);

        feed.authority = ctx.accounts.authority.key();
        feed.asset_symbol = asset_symbol;
        feed.asset_mint = ctx.accounts.asset_mint.key();
        feed.sample_interval_seconds = sample_interval_seconds;
        feed.max_samples = max_samples;
        feed.sample_count = 0;
        feed.last_sample_time = 0;
        feed.last_price = 0;
        feed.twap = 0;
        feed.created_at = clock.unix_timestamp;
        feed.is_active = true;
        feed.bump = ctx.bumps.price_feed;

        msg!("Price feed initialized for {}", feed.asset_symbol);
        Ok(())
    }

    /// Record a new price sample (called by authorized oracle)
    pub fn record_price(
        ctx: Context<RecordPrice>,
        price: u64,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.price_feed;
        let buffer = &mut ctx.accounts.sample_buffer;
        let clock = Clock::get()?;

        require!(feed.is_active, OracleError::FeedInactive);
        require!(price > 0, OracleError::InvalidPrice);

        // Check minimum interval
        let time_since_last = clock.unix_timestamp - feed.last_sample_time;
        require!(
            time_since_last >= feed.sample_interval_seconds as i64,
            OracleError::TooSoon
        );

        // Add sample to buffer
        buffer.samples.push(PriceSample {
            price,
            timestamp: clock.unix_timestamp,
        });

        // Trim buffer if exceeded max samples
        if buffer.samples.len() > feed.max_samples as usize {
            buffer.samples.remove(0);
        }

        // Update feed state
        feed.last_price = price;
        feed.last_sample_time = clock.unix_timestamp;
        feed.sample_count = buffer.samples.len() as u16;

        // Calculate TWAP
        feed.twap = buffer.calculate_twap();

        msg!("Price recorded: {} at {}", price, clock.unix_timestamp);
        Ok(())
    }

    /// Initialize funding rate feed
    pub fn initialize_funding_feed(
        ctx: Context<InitializeFundingFeed>,
        market_symbol: String,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.funding_feed;
        let clock = Clock::get()?;

        require!(market_symbol.len() <= 16, OracleError::SymbolTooLong);

        feed.authority = ctx.accounts.authority.key();
        feed.market_symbol = market_symbol;
        feed.current_rate_bps = 0;
        feed.last_update = clock.unix_timestamp;
        feed.rate_history = Vec::new();
        feed.is_active = true;
        feed.bump = ctx.bumps.funding_feed;

        msg!("Funding feed initialized for {}", feed.market_symbol);
        Ok(())
    }

    /// Record funding rate (called by authorized oracle)
    pub fn record_funding_rate(
        ctx: Context<RecordFundingRate>,
        rate_bps: i16,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.funding_feed;
        let clock = Clock::get()?;

        require!(feed.is_active, OracleError::FeedInactive);

        feed.current_rate_bps = rate_bps;
        feed.last_update = clock.unix_timestamp;

        // Store in history (keep last 100)
        feed.rate_history.push(FundingRateSample {
            rate_bps,
            timestamp: clock.unix_timestamp,
        });
        if feed.rate_history.len() > 100 {
            feed.rate_history.remove(0);
        }

        msg!("Funding rate recorded: {} bps", rate_bps);
        Ok(())
    }
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(asset_symbol: String)]
pub struct InitializePriceFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Asset mint for this price feed
    pub asset_mint: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + PriceFeed::INIT_SPACE,
        seeds = [b"price_feed", asset_mint.key().as_ref()],
        bump
    )]
    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        init,
        payer = authority,
        space = 8 + SampleBuffer::INIT_SPACE,
        seeds = [b"sample_buffer", price_feed.key().as_ref()],
        bump
    )]
    pub sample_buffer: Account<'info, SampleBuffer>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordPrice<'info> {
    #[account(
        constraint = authority.key() == price_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        mut,
        seeds = [b"sample_buffer", price_feed.key().as_ref()],
        bump
    )]
    pub sample_buffer: Account<'info, SampleBuffer>,
}

#[derive(Accounts)]
#[instruction(market_symbol: String)]
pub struct InitializeFundingFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + FundingFeed::INIT_SPACE,
        seeds = [b"funding_feed", market_symbol.as_bytes()],
        bump
    )]
    pub funding_feed: Account<'info, FundingFeed>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordFundingRate<'info> {
    #[account(
        constraint = authority.key() == funding_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub funding_feed: Account<'info, FundingFeed>,
}
