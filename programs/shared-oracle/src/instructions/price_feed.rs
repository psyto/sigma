use anchor_lang::prelude::*;

use crate::{
    errors::OracleError,
    state::{PriceFeed, PriceSample, SampleBuffer},
    InitializePriceFeed, RecordPrice, RecordPriceFromPyth, RecordPriceFromSwitchboard,
    ResetCircuitBreaker, TransferPriceFeedAuthority, UpdatePriceFeed,
};

/// Initialize a new price feed for an asset
pub fn initialize_price_feed(
    ctx: Context<InitializePriceFeed>,
    asset_symbol: String,
    sample_interval_seconds: u64,
    max_samples: u16,
) -> Result<()> {
    let feed_key = ctx.accounts.price_feed.key();
    let feed = &mut ctx.accounts.price_feed;
    let buffer = &mut ctx.accounts.sample_buffer;
    let clock = Clock::get()?;

    // Validate inputs
    require!(asset_symbol.len() <= 16, OracleError::SymbolTooLong);
    require!(
        sample_interval_seconds >= 1,
        OracleError::IntervalTooShort
    );
    require!(
        max_samples >= 10 && max_samples <= 360,
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
    feed.switchboard_feed = None;
    feed.max_deviation_bps = 0; // Circuit breaker disabled by default
    feed.is_circuit_broken = false;
    feed.circuit_break_timestamp = 0;
    feed.last_valid_price = 0;
    feed.bump = ctx.bumps.price_feed;

    // Initialize sample buffer
    buffer.price_feed = feed.key();
    buffer.samples = Vec::new();
    buffer.head_index = 0;
    buffer.bump = ctx.bumps.sample_buffer;

    msg!("Price feed initialized for {}", asset_symbol);

    emit!(crate::PriceFeedInitialized {
        price_feed: feed_key,
        authority: ctx.accounts.authority.key(),
        asset_symbol,
    });

    Ok(())
}

/// Check circuit breaker: if enabled, verify price deviation is within bounds.
/// If deviation exceeds threshold, triggers the circuit breaker and pauses the feed.
/// Returns Ok(()) if price is acceptable, or triggers circuit breaker and returns error.
fn check_circuit_breaker(feed: &mut PriceFeed, new_price: u64, current_time: i64) -> Result<()> {
    // If circuit breaker is already triggered, reject all price updates
    if feed.is_circuit_broken {
        return Err(error!(OracleError::FeedCircuitBroken));
    }

    // If disabled or no previous valid price, accept the price
    if feed.max_deviation_bps == 0 || feed.last_valid_price == 0 {
        feed.last_valid_price = new_price;
        return Ok(());
    }

    // Calculate deviation in basis points
    let deviation = if new_price > feed.last_valid_price {
        ((new_price - feed.last_valid_price) as u128 * 10_000) / feed.last_valid_price as u128
    } else {
        ((feed.last_valid_price - new_price) as u128 * 10_000) / feed.last_valid_price as u128
    };

    if deviation > feed.max_deviation_bps as u128 {
        // Trigger circuit breaker - set flag but DON'T error so the state persists.
        // The price update will be skipped by the caller.
        feed.is_circuit_broken = true;
        feed.circuit_break_timestamp = current_time;
        msg!(
            "CIRCUIT BREAKER TRIGGERED: price {} deviates {}bps from last valid price {} (threshold: {}bps)",
            new_price,
            deviation,
            feed.last_valid_price,
            feed.max_deviation_bps
        );
        return Ok(());
    }

    feed.last_valid_price = new_price;
    Ok(())
}

/// Common logic to record a validated price into the feed and buffer
fn apply_price_update(feed: &mut PriceFeed, buffer: &mut SampleBuffer, price: u64, clock: &Clock) {
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
}

/// Record a new price sample from authorized oracle
pub fn record_price(ctx: Context<RecordPrice>, price: u64) -> Result<()> {
    let feed_key = ctx.accounts.price_feed.key();
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

    // Circuit breaker check (may set is_circuit_broken without erroring)
    check_circuit_breaker(feed, price, clock.unix_timestamp)?;

    // If circuit breaker was just triggered, skip the price update
    if feed.is_circuit_broken {
        msg!("Price rejected by circuit breaker: {}", price);
        return Ok(());
    }

    apply_price_update(feed, buffer, price, &clock);

    msg!(
        "Price recorded: {} | TWAP: {} | Variance: {} bps",
        price,
        feed.twap,
        feed.current_variance
    );

    emit!(crate::PriceRecorded {
        price_feed: feed_key,
        price,
        twap: feed.twap,
        variance_bps: feed.current_variance,
    });

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

    // Circuit breaker check
    check_circuit_breaker(feed, price_normalized, clock.unix_timestamp)?;

    apply_price_update(feed, buffer, price_normalized, &clock);

    msg!(
        "Pyth price recorded: {} | TWAP: {} | Variance: {} bps",
        price_normalized,
        feed.twap,
        feed.current_variance
    );

    Ok(())
}

/// Record price from Switchboard V2 aggregator
///
/// Switchboard V2 AggregatorAccountData layout (repr(packed), zero_copy):
/// Program ID: SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f
///
/// Offsets from account data start (including 8-byte discriminator):
///   358: round_open_timestamp (i64)
///   366: result.mantissa (i128)
///   382: result.scale (u32)
///   386: std_deviation.mantissa (i128)
///   402: std_deviation.scale (u32)
///
/// See: https://github.com/switchboard-xyz/solana-sdk
pub fn record_price_from_switchboard(ctx: Context<RecordPriceFromSwitchboard>) -> Result<()> {
    let feed = &mut ctx.accounts.price_feed;
    let buffer = &mut ctx.accounts.sample_buffer;
    let clock = Clock::get()?;

    // Switchboard V2 program ID
    let switchboard_v2_pid = "SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f"
        .parse::<Pubkey>()
        .unwrap();

    // Validate the account is owned by Switchboard V2
    require!(
        *ctx.accounts.switchboard_aggregator.owner == switchboard_v2_pid,
        OracleError::InvalidSwitchboardFeed
    );

    let sb_data = ctx.accounts.switchboard_aggregator.try_borrow_data()?;

    // Minimum size to read through std_deviation.scale (offset 402 + 4 = 406)
    require!(sb_data.len() >= 406, OracleError::InvalidSwitchboardFeed);

    // Read round_open_timestamp (i64 at offset 358)
    let timestamp_bytes: [u8; 8] = sb_data[358..366]
        .try_into()
        .map_err(|_| error!(OracleError::InvalidSwitchboardFeed))?;
    let round_timestamp = i64::from_le_bytes(timestamp_bytes);

    // Check staleness: reject if Switchboard data is older than max_staleness_seconds
    if feed.max_staleness_seconds > 0 {
        let age = clock.unix_timestamp - round_timestamp;
        require!(
            age <= feed.max_staleness_seconds as i64,
            OracleError::SwitchboardDataStale
        );
    }

    // Read result mantissa (i128 at offset 366)
    let mantissa_bytes: [u8; 16] = sb_data[366..382]
        .try_into()
        .map_err(|_| error!(OracleError::InvalidSwitchboardFeed))?;
    let mantissa = i128::from_le_bytes(mantissa_bytes);

    // Read result scale (u32 at offset 382)
    let scale_bytes: [u8; 4] = sb_data[382..386]
        .try_into()
        .map_err(|_| error!(OracleError::InvalidSwitchboardFeed))?;
    let scale = u32::from_le_bytes(scale_bytes);

    // Validate price is positive
    require!(mantissa > 0, OracleError::InvalidSwitchboardPrice);

    // Read std_deviation mantissa (i128 at offset 386) for confidence check
    let std_dev_bytes: [u8; 16] = sb_data[386..402]
        .try_into()
        .map_err(|_| error!(OracleError::InvalidSwitchboardFeed))?;
    let std_dev_mantissa = i128::from_le_bytes(std_dev_bytes);

    // Confidence check: std_deviation / result should be < 5% (same as Pyth)
    if std_dev_mantissa > 0 && mantissa > 0 {
        let confidence_ratio = mantissa / std_dev_mantissa;
        require!(confidence_ratio >= 20, OracleError::InvalidSwitchboardFeed);
    }

    // Convert to our price format (scaled by 1e6)
    // SwitchboardDecimal: value = mantissa * 10^(-scale)
    let price_normalized = if scale == 0 {
        (mantissa as u64) * 1_000_000
    } else if scale <= 6 {
        // Scale up to 1e6: multiply by 10^(6-scale)
        let multiplier = 10u64.pow(6 - scale);
        (mantissa as u64) * multiplier
    } else {
        // Scale down: divide by 10^(scale-6)
        let divisor = 10i128.pow(scale - 6);
        (mantissa / divisor) as u64
    };

    require!(price_normalized > 0, OracleError::InvalidSwitchboardPrice);

    // Check minimum interval
    if feed.last_sample_time > 0 {
        let time_since_last = clock.unix_timestamp - feed.last_sample_time;
        require!(
            time_since_last >= feed.sample_interval_seconds as i64,
            OracleError::TooSoon
        );
    }

    // Circuit breaker check
    check_circuit_breaker(feed, price_normalized, clock.unix_timestamp)?;

    apply_price_update(feed, buffer, price_normalized, &clock);

    msg!(
        "Switchboard price recorded: {} | TWAP: {} | Variance: {} bps",
        price_normalized,
        feed.twap,
        feed.current_variance
    );

    Ok(())
}

/// Reset the circuit breaker after manual review (authority only)
pub fn reset_circuit_breaker(ctx: Context<ResetCircuitBreaker>, new_valid_price: Option<u64>) -> Result<()> {
    let feed_key = ctx.accounts.price_feed.key();
    let feed = &mut ctx.accounts.price_feed;

    require!(feed.is_circuit_broken, OracleError::FeedInactive);

    feed.is_circuit_broken = false;
    feed.circuit_break_timestamp = 0;

    // Optionally reset the last valid price baseline
    if let Some(price) = new_valid_price {
        require!(price > 0, OracleError::InvalidPrice);
        feed.last_valid_price = price;
    }

    msg!(
        "Circuit breaker reset for {}. Last valid price: {}",
        feed.asset_symbol,
        feed.last_valid_price
    );

    emit!(crate::CircuitBreakerReset {
        price_feed: feed_key,
        new_valid_price: feed.last_valid_price,
    });

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
