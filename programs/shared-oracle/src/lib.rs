use anchor_lang::prelude::*;

declare_id!("DyPhNbm845yWMuAmBLmsLANxm7wDJLDwoQNR2n8n8kM1");

pub mod state;
pub mod errors;
pub mod instructions;

use state::*;
use errors::OracleError;

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

    /// Update price feed configuration
    pub fn update_price_feed(
        ctx: Context<UpdatePriceFeed>,
        new_interval: Option<u64>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::price_feed::update_price_feed(ctx, new_interval, is_active)
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
        constraint = pyth_price_account.key() == price_feed.pyth_feed.unwrap() @ OracleError::InvalidPythFeed
    )]
    pub pyth_price_account: AccountInfo<'info>,
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
