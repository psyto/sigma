use anchor_lang::prelude::*;

declare_id!("81SjyEmtwJUeqU9ZEfc7sm9evVpDuGwRSLrFQeCF4j5o");

pub mod state;
pub mod errors;
pub mod instructions;

use state::*;
use errors::OracleError;

// Re-export important types for external use
pub use state::{
    VolatilityIndex, VolatilityIndexSample, VolatilityRegime,
    CexFundingFeed, ExchangeFundingSource, CexExchange, FundingAggregationMethod, CexFundingRateSample,
    PositionToken, SecondaryMarket, MarketListing, SigmaProtocol, PositionDirection,
};

/// Shared Oracle Program for Sigma Protocol
/// Provides price feeds, TWAP calculations, variance data, and funding rate feeds
/// for VolSwap, FundingSwap, and ExoticVault protocols.
#[program]
pub mod shared_oracle {
    use super::*;

    // ============================================================================
    // Price Feed Instructions
    // ============================================================================

    /// Initialize a new price feed for an asset
    pub fn initialize_price_feed(
        ctx: Context<InitializePriceFeed>,
        asset_symbol: String,
        sample_interval_seconds: u64,
        max_samples: u16,
    ) -> Result<()> {
        instructions::price_feed::initialize_price_feed(
            ctx,
            asset_symbol,
            sample_interval_seconds,
            max_samples,
        )
    }

    /// Record a new price sample from authorized oracle
    pub fn record_price(ctx: Context<RecordPrice>, price: u64) -> Result<()> {
        instructions::price_feed::record_price(ctx, price)
    }

    /// Record price from Pyth oracle
    pub fn record_price_from_pyth(ctx: Context<RecordPriceFromPyth>) -> Result<()> {
        instructions::price_feed::record_price_from_pyth(ctx)
    }

    /// Record price from Switchboard V2 aggregator
    pub fn record_price_from_switchboard(ctx: Context<RecordPriceFromSwitchboard>) -> Result<()> {
        instructions::price_feed::record_price_from_switchboard(ctx)
    }

    /// Update price feed configuration
    pub fn update_price_feed(
        ctx: Context<UpdatePriceFeed>,
        new_interval: Option<u64>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::price_feed::update_price_feed(ctx, new_interval, is_active)
    }

    /// Configure circuit breaker parameters for a price feed
    pub fn configure_circuit_breaker(
        ctx: Context<UpdatePriceFeed>,
        max_deviation_bps: u16,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.price_feed;
        feed.max_deviation_bps = max_deviation_bps;
        msg!(
            "Circuit breaker configured: max deviation = {} bps (0 = disabled)",
            max_deviation_bps
        );
        Ok(())
    }

    /// Configure Switchboard feed for a price feed
    pub fn set_switchboard_feed(
        ctx: Context<UpdatePriceFeed>,
        switchboard_feed: Option<Pubkey>,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.price_feed;
        feed.switchboard_feed = switchboard_feed;
        msg!("Switchboard feed updated: {:?}", switchboard_feed);
        Ok(())
    }

    /// Reset circuit breaker after manual review (authority only)
    pub fn reset_circuit_breaker(
        ctx: Context<ResetCircuitBreaker>,
        new_valid_price: Option<u64>,
    ) -> Result<()> {
        instructions::price_feed::reset_circuit_breaker(ctx, new_valid_price)
    }

    /// Transfer price feed authority
    pub fn transfer_price_feed_authority(
        ctx: Context<TransferPriceFeedAuthority>,
    ) -> Result<()> {
        instructions::price_feed::transfer_authority(ctx)
    }

    // ============================================================================
    // Funding Feed Instructions
    // ============================================================================

    /// Initialize funding rate feed for a perpetual market
    pub fn initialize_funding_feed(
        ctx: Context<InitializeFundingFeed>,
        market_symbol: String,
        funding_interval_seconds: u64,
    ) -> Result<()> {
        instructions::funding_feed::initialize_funding_feed(
            ctx,
            market_symbol,
            funding_interval_seconds,
        )
    }

    /// Record funding rate from authorized oracle
    pub fn record_funding_rate(ctx: Context<RecordFundingRate>, rate_bps: i64) -> Result<()> {
        instructions::funding_feed::record_funding_rate(ctx, rate_bps)
    }

    /// Update funding feed configuration
    pub fn update_funding_feed(
        ctx: Context<UpdateFundingFeed>,
        new_interval: Option<u64>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::funding_feed::update_funding_feed(ctx, new_interval, is_active)
    }

    // ============================================================================
    // Aggregated Feed Instructions
    // ============================================================================

    /// Initialize an aggregated price feed with multiple sources
    pub fn initialize_aggregated_feed(
        ctx: Context<InitializeAggregatedFeed>,
        asset_symbol: String,
        aggregation_method: AggregationMethod,
    ) -> Result<()> {
        instructions::aggregated_feed::initialize_aggregated_feed(
            ctx,
            asset_symbol,
            aggregation_method,
        )
    }

    /// Add a price source to an aggregated feed
    pub fn add_price_source(
        ctx: Context<AddPriceSource>,
        source_type: PriceSourceType,
        weight: u16,
    ) -> Result<()> {
        instructions::aggregated_feed::add_price_source(ctx, source_type, weight)
    }

    /// Update aggregated price from all sources
    pub fn update_aggregated_price(ctx: Context<UpdateAggregatedPrice>) -> Result<()> {
        instructions::aggregated_feed::update_aggregated_price(ctx)
    }

    // ============================================================================
    // Variance Tracking Instructions
    // ============================================================================

    /// Initialize variance tracker for an asset
    pub fn initialize_variance_tracker(
        ctx: Context<InitializeVarianceTracker>,
        epoch_duration_seconds: u64,
    ) -> Result<()> {
        instructions::variance::initialize_variance_tracker(ctx, epoch_duration_seconds)
    }

    /// Finalize variance for completed epoch
    pub fn finalize_epoch_variance(ctx: Context<FinalizeEpochVariance>) -> Result<()> {
        instructions::variance::finalize_epoch_variance(ctx)
    }

    /// Start new variance epoch
    pub fn start_new_variance_epoch(ctx: Context<StartNewVarianceEpoch>) -> Result<()> {
        instructions::variance::start_new_variance_epoch(ctx)
    }

    // ============================================================================
    // Volatility Index Instructions (SVI)
    // ============================================================================

    /// Initialize a new volatility index (e.g., SVI-SOL-14D)
    pub fn initialize_volatility_index(
        ctx: Context<InitializeVolatilityIndex>,
        index_name: String,
        duration_days: u8,
        implied_weight: u16,
    ) -> Result<()> {
        let index = &mut ctx.accounts.volatility_index;
        let clock = Clock::get()?;

        index.authority = ctx.accounts.authority.key();
        index.asset_symbol = ctx.accounts.price_feed.asset_symbol.clone();
        index.index_name = index_name;
        index.price_feed = ctx.accounts.price_feed.key();
        index.variance_tracker = ctx.accounts.variance_tracker.key();
        index.duration_days = duration_days;
        index.current_value = 0;
        index.high_24h = 0;
        index.low_24h = u64::MAX;
        index.change_24h_bps = 0;
        index.avg_7d = 0;
        index.avg_30d = 0;
        index.realized_vol = ctx.accounts.variance_tracker.current_epoch_variance;
        index.implied_vol = 0;
        index.implied_weight = implied_weight;
        index.index_history = Vec::new();
        index.last_update = clock.unix_timestamp;
        index.created_at = clock.unix_timestamp;
        index.is_active = true;
        index.bump = ctx.bumps.volatility_index;

        Ok(())
    }

    /// Update volatility index with latest data
    pub fn update_volatility_index(ctx: Context<UpdateVolatilityIndex>) -> Result<()> {
        let index = &mut ctx.accounts.volatility_index;
        let variance_tracker = &ctx.accounts.variance_tracker;
        let clock = Clock::get()?;

        // Update realized volatility from variance tracker
        index.realized_vol = variance_tracker.current_epoch_variance;

        // Calculate new index value
        let new_value = index.calculate_index_value();

        // Update 24h high/low
        if new_value > index.high_24h {
            index.high_24h = new_value;
        }
        if new_value < index.low_24h {
            index.low_24h = new_value;
        }

        // Calculate 24h change
        let samples_24h_ago: Vec<&VolatilityIndexSample> = index.index_history
            .iter()
            .filter(|s| clock.unix_timestamp - s.timestamp <= 86400)
            .collect();

        if let Some(oldest) = samples_24h_ago.first() {
            if oldest.value > 0 {
                index.change_24h_bps = ((new_value as i64 - oldest.value as i64) * 10000) / oldest.value as i64;
            }
        }

        // Update averages
        let samples_7d: Vec<u64> = index.index_history
            .iter()
            .filter(|s| clock.unix_timestamp - s.timestamp <= 7 * 86400)
            .map(|s| s.value)
            .collect();

        if !samples_7d.is_empty() {
            index.avg_7d = samples_7d.iter().sum::<u64>() / samples_7d.len() as u64;
        }

        let samples_30d: Vec<u64> = index.index_history
            .iter()
            .filter(|s| clock.unix_timestamp - s.timestamp <= 30 * 86400)
            .map(|s| s.value)
            .collect();

        if !samples_30d.is_empty() {
            index.avg_30d = samples_30d.iter().sum::<u64>() / samples_30d.len() as u64;
        }

        // Add to history
        index.index_history.push(VolatilityIndexSample {
            value: new_value,
            timestamp: clock.unix_timestamp,
        });

        // Trim history to max 168 samples (7 days hourly)
        if index.index_history.len() > 168 {
            index.index_history.remove(0);
        }

        index.current_value = new_value;
        index.last_update = clock.unix_timestamp;

        Ok(())
    }

    /// Set implied volatility (from external options data)
    pub fn set_implied_volatility(
        ctx: Context<SetImpliedVolatility>,
        implied_vol: u64,
    ) -> Result<()> {
        let index = &mut ctx.accounts.volatility_index;
        index.implied_vol = implied_vol;
        Ok(())
    }

    // ============================================================================
    // CEX Funding Rate Instructions
    // ============================================================================

    /// Initialize CEX funding rate aggregator
    pub fn initialize_cex_funding_feed(
        ctx: Context<InitializeCexFundingFeed>,
        market_symbol: String,
        aggregation_method: FundingAggregationMethod,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.cex_funding_feed;
        let clock = Clock::get()?;

        feed.authority = ctx.accounts.authority.key();
        feed.market_symbol = market_symbol;
        feed.exchange_sources = Vec::new();
        feed.aggregated_rate_bps = 0;
        feed.aggregation_method = aggregation_method;
        feed.total_open_interest = 0;
        feed.oi_weighted_rate_bps = 0;
        feed.rate_history = Vec::new();
        feed.last_update = clock.unix_timestamp;
        feed.is_active = true;
        feed.bump = ctx.bumps.cex_funding_feed;

        Ok(())
    }

    /// Add an exchange source to CEX funding feed
    pub fn add_exchange_source(
        ctx: Context<AddExchangeSource>,
        exchange: CexExchange,
        funding_interval: u64,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.cex_funding_feed;
        let clock = Clock::get()?;

        require!(feed.exchange_sources.len() < 8, OracleError::TooManySources);

        feed.exchange_sources.push(ExchangeFundingSource {
            exchange,
            current_rate_bps: 0,
            next_funding_time: 0,
            funding_interval,
            open_interest: 0,
            last_update: clock.unix_timestamp,
            is_active: true,
        });

        Ok(())
    }

    /// Update funding rate for a specific exchange
    pub fn update_exchange_funding(
        ctx: Context<UpdateExchangeFunding>,
        exchange: CexExchange,
        rate_bps: i64,
        open_interest: u64,
        next_funding_time: i64,
    ) -> Result<()> {
        let feed = &mut ctx.accounts.cex_funding_feed;
        let clock = Clock::get()?;

        // Find and update the exchange source
        let source = feed.exchange_sources
            .iter_mut()
            .find(|s| s.exchange == exchange)
            .ok_or(OracleError::ExchangeNotFound)?;

        source.current_rate_bps = rate_bps;
        source.open_interest = open_interest;
        source.next_funding_time = next_funding_time;
        source.last_update = clock.unix_timestamp;

        // Recalculate aggregated values
        feed.aggregated_rate_bps = feed.calculate_aggregated_rate();
        feed.total_open_interest = feed.exchange_sources
            .iter()
            .filter(|s| s.is_active)
            .map(|s| s.open_interest)
            .sum();

        // Calculate OI-weighted rate
        let weighted_sum: i128 = feed.exchange_sources
            .iter()
            .filter(|s| s.is_active)
            .map(|s| s.current_rate_bps as i128 * s.open_interest as i128)
            .sum();

        if feed.total_open_interest > 0 {
            feed.oi_weighted_rate_bps = (weighted_sum / feed.total_open_interest as i128) as i64;
        }

        // Store values before pushing to history (to avoid borrow conflict)
        let rate_bps = feed.aggregated_rate_bps;
        let oi_weighted_rate = feed.oi_weighted_rate_bps;
        let total_oi = feed.total_open_interest;

        // Add to history
        feed.rate_history.push(CexFundingRateSample {
            rate_bps,
            oi_weighted_rate_bps: oi_weighted_rate,
            total_oi,
            timestamp: clock.unix_timestamp,
        });

        // Trim history
        if feed.rate_history.len() > 168 {
            feed.rate_history.remove(0);
        }

        feed.last_update = clock.unix_timestamp;

        Ok(())
    }

    // ============================================================================
    // Secondary Market Instructions
    // ============================================================================

    /// Initialize secondary market for a protocol
    pub fn initialize_secondary_market(
        ctx: Context<InitializeSecondaryMarket>,
        protocol: SigmaProtocol,
        fee_rate_bps: u16,
    ) -> Result<()> {
        let market = &mut ctx.accounts.secondary_market;

        market.authority = ctx.accounts.authority.key();
        market.protocol = protocol;
        market.listings = Vec::new();
        market.total_volume = 0;
        market.total_trades = 0;
        market.fee_rate_bps = fee_rate_bps;
        market.fee_recipient = ctx.accounts.fee_recipient.key();
        market.is_active = true;
        market.bump = ctx.bumps.secondary_market;

        Ok(())
    }

    /// Tokenize a position for secondary market trading
    pub fn tokenize_position(
        ctx: Context<TokenizePosition>,
        protocol: SigmaProtocol,
        notional: u64,
        expiry: i64,
        direction: PositionDirection,
        strike: u64,
        position_hash: [u8; 32],
    ) -> Result<()> {
        let token = &mut ctx.accounts.position_token;
        let clock = Clock::get()?;

        token.owner = ctx.accounts.owner.key();
        token.protocol = protocol;
        token.position_account = ctx.accounts.position_account.key();
        token.position_hash = position_hash;
        token.notional = notional;
        token.mark_to_market = notional as i64; // Initial MTM = notional
        token.expiry = expiry;
        token.direction = direction;
        token.strike = strike;
        token.created_at = clock.unix_timestamp;
        token.is_listed = false;
        token.listing_price = 0;
        token.min_price = 0;
        token.is_active = true;
        token.bump = ctx.bumps.position_token;

        Ok(())
    }

    /// List a position token for sale
    pub fn list_position(
        ctx: Context<ListPosition>,
        price: u64,
        min_price: u64,
        listing_expiry: i64,
    ) -> Result<()> {
        let token = &mut ctx.accounts.position_token;
        let market = &mut ctx.accounts.secondary_market;
        let clock = Clock::get()?;

        require!(token.is_active, OracleError::PositionInactive);
        require!(!token.is_expired(clock.unix_timestamp), OracleError::PositionExpired);

        token.is_listed = true;
        token.listing_price = price;
        token.min_price = min_price;

        // Add to market listings
        market.listings.push(MarketListing {
            position_token: ctx.accounts.position_token.key(),
            seller: ctx.accounts.owner.key(),
            price,
            listed_at: clock.unix_timestamp,
            listing_expiry,
            is_active: true,
        });

        emit!(PositionListed {
            position_token: ctx.accounts.position_token.key(),
            seller: ctx.accounts.owner.key(),
            price,
        });

        Ok(())
    }

    /// Cancel a position listing
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let token = &mut ctx.accounts.position_token;
        let market = &mut ctx.accounts.secondary_market;

        token.is_listed = false;
        token.listing_price = 0;
        token.min_price = 0;

        // Remove from market listings
        if let Some(idx) = market.listings.iter().position(|l| l.position_token == ctx.accounts.position_token.key()) {
            market.listings[idx].is_active = false;
        }

        Ok(())
    }

    /// Buy a listed position
    pub fn buy_position(ctx: Context<BuyPosition>) -> Result<()> {
        let token = &mut ctx.accounts.position_token;
        let market = &mut ctx.accounts.secondary_market;
        let _clock = Clock::get()?;

        require!(token.is_listed, OracleError::NotListed);
        require!(token.is_active, OracleError::PositionInactive);

        let price = token.listing_price;

        // Transfer ownership
        token.owner = ctx.accounts.buyer.key();
        token.is_listed = false;
        token.listing_price = 0;

        // Update market stats
        market.total_volume += price;
        market.total_trades += 1;

        // Deactivate listing
        if let Some(idx) = market.listings.iter().position(|l| l.position_token == ctx.accounts.position_token.key()) {
            market.listings[idx].is_active = false;
        }

        // Note: Actual USDC transfer would be handled in a separate instruction
        // or through CPI to token program

        emit!(PositionSold {
            position_token: ctx.accounts.position_token.key(),
            buyer: ctx.accounts.buyer.key(),
            price,
        });

        Ok(())
    }

    /// Update mark-to-market value for a position
    pub fn update_position_mtm(
        ctx: Context<UpdatePositionMtm>,
        new_mtm: i64,
    ) -> Result<()> {
        let token = &mut ctx.accounts.position_token;
        token.mark_to_market = new_mtm;
        Ok(())
    }
}

// ============================================================================
// Contexts - Price Feed
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

    #[account(
        mut,
        constraint = price_feed.is_active @ OracleError::FeedInactive
    )]
    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        mut,
        seeds = [b"sample_buffer", price_feed.key().as_ref()],
        bump = sample_buffer.bump
    )]
    pub sample_buffer: Account<'info, SampleBuffer>,
}

#[derive(Accounts)]
pub struct RecordPriceFromPyth<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = price_feed.is_active @ OracleError::FeedInactive,
        constraint = price_feed.pyth_feed.is_some() @ OracleError::NoPythFeed
    )]
    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        mut,
        seeds = [b"sample_buffer", price_feed.key().as_ref()],
        bump = sample_buffer.bump
    )]
    pub sample_buffer: Account<'info, SampleBuffer>,

    /// CHECK: Pyth price account, validated in handler
    #[account(
        constraint = pyth_price_account.key() == price_feed.pyth_feed.unwrap_or_default() @ OracleError::InvalidPythFeed
    )]
    pub pyth_price_account: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RecordPriceFromSwitchboard<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = price_feed.is_active @ OracleError::FeedInactive,
        constraint = price_feed.switchboard_feed.is_some() @ OracleError::NoSwitchboardFeed
    )]
    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        mut,
        seeds = [b"sample_buffer", price_feed.key().as_ref()],
        bump = sample_buffer.bump
    )]
    pub sample_buffer: Account<'info, SampleBuffer>,

    /// CHECK: Switchboard V2 aggregator account, validated in handler
    #[account(
        constraint = switchboard_aggregator.key() == price_feed.switchboard_feed.unwrap_or_default() @ OracleError::InvalidSwitchboardFeed
    )]
    pub switchboard_aggregator: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ResetCircuitBreaker<'info> {
    #[account(
        constraint = authority.key() == price_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub price_feed: Account<'info, PriceFeed>,
}

#[derive(Accounts)]
pub struct UpdatePriceFeed<'info> {
    #[account(
        constraint = authority.key() == price_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub price_feed: Account<'info, PriceFeed>,
}

#[derive(Accounts)]
pub struct TransferPriceFeedAuthority<'info> {
    #[account(
        constraint = authority.key() == price_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// CHECK: New authority
    pub new_authority: AccountInfo<'info>,

    #[account(mut)]
    pub price_feed: Account<'info, PriceFeed>,
}

// ============================================================================
// Contexts - Funding Feed
// ============================================================================

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

    #[account(
        mut,
        constraint = funding_feed.is_active @ OracleError::FeedInactive
    )]
    pub funding_feed: Account<'info, FundingFeed>,
}

#[derive(Accounts)]
pub struct UpdateFundingFeed<'info> {
    #[account(
        constraint = authority.key() == funding_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub funding_feed: Account<'info, FundingFeed>,
}

// ============================================================================
// Contexts - Aggregated Feed
// ============================================================================

#[derive(Accounts)]
#[instruction(asset_symbol: String)]
pub struct InitializeAggregatedFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + AggregatedFeed::INIT_SPACE,
        seeds = [b"aggregated_feed", asset_symbol.as_bytes()],
        bump
    )]
    pub aggregated_feed: Account<'info, AggregatedFeed>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddPriceSource<'info> {
    #[account(
        constraint = authority.key() == aggregated_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub aggregated_feed: Account<'info, AggregatedFeed>,

    /// CHECK: Source account (PriceFeed or external oracle)
    pub source_account: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateAggregatedPrice<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = aggregated_feed.is_active @ OracleError::FeedInactive
    )]
    pub aggregated_feed: Account<'info, AggregatedFeed>,
    // Remaining accounts: price sources
}

// ============================================================================
// Contexts - Variance Tracking
// ============================================================================

#[derive(Accounts)]
pub struct InitializeVarianceTracker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        init,
        payer = authority,
        space = 8 + VarianceTracker::INIT_SPACE,
        seeds = [b"variance_tracker", price_feed.key().as_ref()],
        bump
    )]
    pub variance_tracker: Account<'info, VarianceTracker>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeEpochVariance<'info> {
    pub authority: Signer<'info>,

    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        seeds = [b"sample_buffer", price_feed.key().as_ref()],
        bump = sample_buffer.bump
    )]
    pub sample_buffer: Account<'info, SampleBuffer>,

    #[account(
        mut,
        seeds = [b"variance_tracker", price_feed.key().as_ref()],
        bump = variance_tracker.bump,
        constraint = variance_tracker.price_feed == price_feed.key() @ OracleError::InvalidPriceFeed
    )]
    pub variance_tracker: Account<'info, VarianceTracker>,
}

#[derive(Accounts)]
pub struct StartNewVarianceEpoch<'info> {
    pub authority: Signer<'info>,

    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        mut,
        seeds = [b"variance_tracker", price_feed.key().as_ref()],
        bump = variance_tracker.bump
    )]
    pub variance_tracker: Account<'info, VarianceTracker>,
}

// ============================================================================
// Contexts - Volatility Index
// ============================================================================

#[derive(Accounts)]
#[instruction(index_name: String)]
pub struct InitializeVolatilityIndex<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub price_feed: Account<'info, PriceFeed>,

    #[account(
        seeds = [b"variance_tracker", price_feed.key().as_ref()],
        bump = variance_tracker.bump
    )]
    pub variance_tracker: Account<'info, VarianceTracker>,

    #[account(
        init,
        payer = authority,
        space = 8 + VolatilityIndex::INIT_SPACE,
        seeds = [b"volatility_index", price_feed.key().as_ref(), index_name.as_bytes()],
        bump
    )]
    pub volatility_index: Account<'info, VolatilityIndex>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateVolatilityIndex<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = volatility_index.is_active @ OracleError::FeedInactive
    )]
    pub volatility_index: Account<'info, VolatilityIndex>,

    #[account(
        constraint = variance_tracker.key() == volatility_index.variance_tracker @ OracleError::InvalidVarianceTracker
    )]
    pub variance_tracker: Account<'info, VarianceTracker>,
}

#[derive(Accounts)]
pub struct SetImpliedVolatility<'info> {
    #[account(
        constraint = authority.key() == volatility_index.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub volatility_index: Account<'info, VolatilityIndex>,
}

// ============================================================================
// Contexts - CEX Funding Feed
// ============================================================================

#[derive(Accounts)]
#[instruction(market_symbol: String)]
pub struct InitializeCexFundingFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + CexFundingFeed::INIT_SPACE,
        seeds = [b"cex_funding_feed", market_symbol.as_bytes()],
        bump
    )]
    pub cex_funding_feed: Account<'info, CexFundingFeed>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddExchangeSource<'info> {
    #[account(
        constraint = authority.key() == cex_funding_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub cex_funding_feed: Account<'info, CexFundingFeed>,
}

#[derive(Accounts)]
pub struct UpdateExchangeFunding<'info> {
    #[account(
        constraint = authority.key() == cex_funding_feed.authority @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = cex_funding_feed.is_active @ OracleError::FeedInactive
    )]
    pub cex_funding_feed: Account<'info, CexFundingFeed>,
}

// ============================================================================
// Contexts - Secondary Market
// ============================================================================

#[derive(Accounts)]
#[instruction(protocol: SigmaProtocol)]
pub struct InitializeSecondaryMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Fee recipient account
    pub fee_recipient: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + SecondaryMarket::INIT_SPACE,
        seeds = [b"secondary_market", protocol.seed_bytes().as_ref()],
        bump
    )]
    pub secondary_market: Account<'info, SecondaryMarket>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TokenizePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Original position account in the protocol
    pub position_account: AccountInfo<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + PositionToken::INIT_SPACE,
        seeds = [b"position_token", position_account.key().as_ref()],
        bump
    )]
    pub position_token: Account<'info, PositionToken>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ListPosition<'info> {
    #[account(
        constraint = owner.key() == position_token.owner @ OracleError::Unauthorized
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = position_token.protocol == secondary_market.protocol @ OracleError::ProtocolMismatch
    )]
    pub position_token: Account<'info, PositionToken>,

    #[account(
        mut,
        constraint = secondary_market.is_active @ OracleError::MarketInactive
    )]
    pub secondary_market: Account<'info, SecondaryMarket>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(
        constraint = owner.key() == position_token.owner @ OracleError::Unauthorized
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = position_token.is_listed @ OracleError::NotListed
    )]
    pub position_token: Account<'info, PositionToken>,

    #[account(mut)]
    pub secondary_market: Account<'info, SecondaryMarket>,
}

#[derive(Accounts)]
pub struct BuyPosition<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        constraint = position_token.is_listed @ OracleError::NotListed,
        constraint = position_token.is_active @ OracleError::PositionInactive
    )]
    pub position_token: Account<'info, PositionToken>,

    #[account(
        mut,
        constraint = secondary_market.is_active @ OracleError::MarketInactive
    )]
    pub secondary_market: Account<'info, SecondaryMarket>,

    // Note: In production, would include token accounts for USDC transfer
}

#[derive(Accounts)]
pub struct UpdatePositionMtm<'info> {
    #[account(
        constraint = authority.key() == position_token.owner @ OracleError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub position_token: Account<'info, PositionToken>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct PriceFeedInitialized {
    pub price_feed: Pubkey,
    pub authority: Pubkey,
    pub asset_symbol: String,
}

#[event]
pub struct PriceRecorded {
    pub price_feed: Pubkey,
    pub price: u64,
    pub twap: u64,
    pub variance_bps: u64,
}

#[event]
pub struct CircuitBreakerTriggered {
    pub price_feed: Pubkey,
    pub rejected_price: u64,
    pub last_valid_price: u64,
    pub deviation_bps: u64,
}

#[event]
pub struct CircuitBreakerReset {
    pub price_feed: Pubkey,
    pub new_valid_price: u64,
}

#[event]
pub struct FundingRateRecorded {
    pub funding_feed: Pubkey,
    pub rate_bps: i64,
}

#[event]
pub struct VarianceFinalized {
    pub variance_tracker: Pubkey,
    pub epoch: u64,
    pub variance_bps: u64,
}

#[event]
pub struct PositionListed {
    pub position_token: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
}

#[event]
pub struct PositionSold {
    pub position_token: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
}
