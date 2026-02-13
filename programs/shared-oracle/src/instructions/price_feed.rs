use anchor_lang::prelude::*;

use crate::{
    errors::OracleError,
    state::{PriceFeed, PriceSample, SampleBuffer},
    InitializePriceFeed, RecordPrice, RecordPriceFromPyth, TransferPriceFeedAuthority,
    UpdatePriceFeed,
};

/// Initialize a new price feed for an asset
pub fn initialize_price_feed(
    ctx: Context<InitializePriceFeed>,
    asset_symbol: String,
    sample_interval_seconds: u64,
    max_samples: u16,
) -> Result<()> {
    let feed = &mut ctx.accounts.price_feed;
    let buffer = &mut ctx.accounts.sample_buffer;
    let clock = Clock::get()?;

    // Validate inputs
    require!(asset_symbol.len() <= 16, OracleError::SymbolTooLong);
    require!(
        sample_interval_seconds >= 60,
        OracleError::IntervalTooShort
    );
    require!(
        max_samples >= 100 && max_samples <= 10000,
        OracleError::InvalidMaxSamples
    );

    // Initialize price feed
    feed.authority = ctx.accounts.authority.key();
    feed.asset_symbol = asset_symbol.clone();
    feed.asset_mint = ctx.accounts.asset_mint.key();
    feed.pyth_feed = None;
    feed.sample_interval_seconds = sample_interval_seconds;
    feed.max_samples = max_samples;
    feed.sample_count = 0;
    feed.last_sample_time = 0;
    feed.last_price = 0;
    feed.twap = 0;
    feed.ema = 0;
    feed.current_variance = 0;
    feed.period_high = 0;
    feed.period_low = u64::MAX;
    feed.created_at = clock.unix_timestamp;
    feed.is_active = true;
    feed.max_staleness_seconds = sample_interval_seconds * 10; // Default: 10x interval
    feed.bump = ctx.bumps.price_feed;

    // Initialize sample buffer
    buffer.price_feed = feed.key();
    buffer.samples = Vec::new();
    buffer.head_index = 0;
    buffer.bump = ctx.bumps.sample_buffer;

    msg!("Price feed initialized for {}", asset_symbol);
    Ok(())
}

/// Record a new price sample from authorized oracle
pub fn record_price(ctx: Context<RecordPrice>, price: u64) -> Result<()> {
    let feed = &mut ctx.accounts.price_feed;
    let buffer = &mut ctx.accounts.sample_buffer;
    let clock = Clock::get()?;

    // Validate price
    require!(price > 0, OracleError::InvalidPrice);

    // Check minimum interval (skip for first sample)
    if feed.last_sample_time > 0 {
        let time_since_last = clock.unix_timestamp - feed.last_sample_time;
        require!(
            time_since_last >= feed.sample_interval_seconds as i64,
            OracleError::TooSoon
        );
    }

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

    // Update high/low
    if price > feed.period_high {
        feed.period_high = price;
    }
    if price < feed.period_low {
        feed.period_low = price;
    }

    // Calculate derived values
    feed.twap = buffer.calculate_twap();
    feed.ema = buffer.calculate_ema(200); // Alpha = 0.02 (200/10000)
    feed.current_variance = buffer.calculate_realized_variance(feed.sample_interval_seconds);

    msg!(
        "Price recorded: {} | TWAP: {} | Variance: {} bps",
        price,
        feed.twap,
        feed.current_variance
    );

    Ok(())
}

/// Record price from Pyth oracle
/// Pyth price account data layout:
/// - magic: u32 (offset 0)
/// - version: u32 (offset 4)
/// - type: u32 (offset 8)
/// - size: u32 (offset 12)
/// - price_type: u32 (offset 16)
/// - expo: i32 (offset 20)
/// - num_publishers: u32 (offset 24)
/// - num_valid_publishers: u32 (offset 28)
/// - last_slot: u64 (offset 32)
/// - valid_slot: u64 (offset 40)
/// - twap: i64 (offset 48) - EMA price
/// - twac: u64 (offset 56) - EMA confidence
/// - price: i64 (offset 208) - actual price
/// - conf: u64 (offset 216) - confidence
pub fn record_price_from_pyth(ctx: Context<RecordPriceFromPyth>) -> Result<()> {
    let feed = &mut ctx.accounts.price_feed;
    let buffer = &mut ctx.accounts.sample_buffer;
    let clock = Clock::get()?;

    // Read Pyth price account data
    let pyth_data = ctx.accounts.pyth_price_account.try_borrow_data()?;

    // Validate minimum size
    require!(pyth_data.len() >= 224, OracleError::InvalidPythFeed);

    // Read expo (i32 at offset 20)
    let expo_bytes: [u8; 4] = pyth_data[20..24]
        .try_into()
        .map_err(|_| error!(OracleError::InvalidPythFeed))?;
    let expo = i32::from_le_bytes(expo_bytes);

    // Read price (i64 at offset 208)
    let price_bytes: [u8; 8] = pyth_data[208..216]
        .try_into()
        .map_err(|_| error!(OracleError::InvalidPythFeed))?;
    let price = i64::from_le_bytes(price_bytes);

    // Read confidence (u64 at offset 216)
    let conf_bytes: [u8; 8] = pyth_data[216..224]
        .try_into()
        .map_err(|_| error!(OracleError::InvalidPythFeed))?;
    let conf = u64::from_le_bytes(conf_bytes);

    // Validate price
    require!(price > 0, OracleError::NegativePythPrice);

    // Convert to our price format (scaled by 1e6)
    let price_normalized = if expo >= 0 {
        (price as u64) * 10u64.pow(expo as u32) * 1_000_000
    } else {
        let divisor = 10i64.pow((-expo) as u32);
        ((price as i128 * 1_000_000) / divisor as i128) as u64
    };

    // Check confidence (price / confidence should be > 20 for 5% max uncertainty)
    let confidence_ratio = if conf > 0 {
        price as u64 / conf
    } else {
        u64::MAX
    };
    require!(confidence_ratio >= 20, OracleError::LowPythConfidence);

    // Check minimum interval
    if feed.last_sample_time > 0 {
        let time_since_last = clock.unix_timestamp - feed.last_sample_time;
        require!(
            time_since_last >= feed.sample_interval_seconds as i64,
            OracleError::TooSoon
        );
    }

    // Add sample to buffer
    buffer.samples.push(PriceSample {
        price: price_normalized,
        timestamp: clock.unix_timestamp,
    });

    // Trim buffer if exceeded
    if buffer.samples.len() > feed.max_samples as usize {
        buffer.samples.remove(0);
    }

    // Update feed state
    feed.last_price = price_normalized;
    feed.last_sample_time = clock.unix_timestamp;
    feed.sample_count = buffer.samples.len() as u16;

    // Update high/low
    if price_normalized > feed.period_high {
        feed.period_high = price_normalized;
    }
    if price_normalized < feed.period_low {
        feed.period_low = price_normalized;
    }

    // Calculate derived values
    feed.twap = buffer.calculate_twap();
    feed.ema = buffer.calculate_ema(200);
    feed.current_variance = buffer.calculate_realized_variance(feed.sample_interval_seconds);

    msg!(
        "Pyth price recorded: {} | TWAP: {} | Variance: {} bps",
        price_normalized,
        feed.twap,
        feed.current_variance
    );

    Ok(())
}

/// Update price feed configuration
pub fn update_price_feed(
    ctx: Context<UpdatePriceFeed>,
    new_interval: Option<u64>,
    is_active: Option<bool>,
) -> Result<()> {
    let feed = &mut ctx.accounts.price_feed;

    if let Some(interval) = new_interval {
        require!(interval >= 60, OracleError::IntervalTooShort);
        feed.sample_interval_seconds = interval;
        feed.max_staleness_seconds = interval * 10;
        msg!("Sample interval updated to {} seconds", interval);
    }

    if let Some(active) = is_active {
        feed.is_active = active;
        msg!("Feed active status: {}", active);
    }

    Ok(())
}

/// Transfer price feed authority
pub fn transfer_authority(ctx: Context<TransferPriceFeedAuthority>) -> Result<()> {
    let feed = &mut ctx.accounts.price_feed;
    let new_authority = ctx.accounts.new_authority.key();

    msg!(
        "Authority transferred from {} to {}",
        feed.authority,
        new_authority
    );

    feed.authority = new_authority;

    Ok(())
}
