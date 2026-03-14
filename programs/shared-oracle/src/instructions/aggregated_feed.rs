use anchor_lang::prelude::*;

use crate::{
    errors::OracleError,
    state::{AggregationMethod, PriceFeed, PriceSource, PriceSourceType},
    AddPriceSource, InitializeAggregatedFeed, UpdateAggregatedPrice,
};

/// Initialize an aggregated price feed with multiple sources
pub fn initialize_aggregated_feed(
    ctx: Context<InitializeAggregatedFeed>,
    asset_symbol: String,
    aggregation_method: AggregationMethod,
) -> Result<()> {
    let feed = &mut ctx.accounts.aggregated_feed;
    let clock = Clock::get()?;

    // Validate inputs
    require!(!asset_symbol.is_empty() && asset_symbol.len() <= 16, OracleError::SymbolTooLong);

    // Initialize aggregated feed
    feed.authority = ctx.accounts.authority.key();
    feed.asset_symbol = asset_symbol.clone();
    feed.aggregation_method = aggregation_method;
    feed.sources = Vec::new();
    feed.current_price = 0;
    feed.confidence = 0;
    feed.last_update = clock.unix_timestamp;
    feed.is_active = true;
    feed.bump = ctx.bumps.aggregated_feed;

    msg!(
        "Aggregated feed initialized for {} with {:?} method",
        asset_symbol,
        aggregation_method
    );
    Ok(())
}

/// Add a price source to an aggregated feed
pub fn add_price_source(
    ctx: Context<AddPriceSource>,
    source_type: PriceSourceType,
    weight: u16,
) -> Result<()> {
    let feed = &mut ctx.accounts.aggregated_feed;
    let source_account = ctx.accounts.source_account.key();

    // Validate
    require!(feed.sources.len() < 8, OracleError::MaxSourcesReached);
    require!(weight >= 1 && weight <= 10000, OracleError::InvalidWeight);

    // Check source doesn't already exist
    let source_exists = feed.sources.iter().any(|s| s.account == source_account);
    require!(!source_exists, OracleError::SourceAlreadyExists);

    // Add source
    feed.sources.push(PriceSource {
        account: source_account,
        source_type,
        weight,
        last_price: 0,
        last_update: 0,
        is_active: true,
    });

    msg!(
        "Price source added: {:?} with weight {}",
        source_type,
        weight
    );
    Ok(())
}

/// Update aggregated price from all sources
pub fn update_aggregated_price(ctx: Context<UpdateAggregatedPrice>) -> Result<()> {
    let feed = &mut ctx.accounts.aggregated_feed;
    let clock = Clock::get()?;

    // Get remaining accounts (price sources)
    let remaining_accounts = ctx.remaining_accounts;

    // Update prices from each source
    for (i, source) in feed.sources.iter_mut().enumerate() {
        if !source.is_active {
            continue;
        }

        // Find corresponding account in remaining accounts
        let source_account = remaining_accounts.get(i);

        if let Some(account_info) = source_account {
            // Verify account matches
            if account_info.key() != source.account {
                continue;
            }

            // Read price based on source type
            let price = match source.source_type {
                PriceSourceType::SigmaFeed => {
                    // Read from Sigma PriceFeed account
                    read_sigma_price(account_info)?
                }
                PriceSourceType::Pyth => {
                    // Read from Pyth
                    read_pyth_price(account_info, clock.unix_timestamp)?
                }
                PriceSourceType::Switchboard => {
                    // Read from Switchboard
                    read_switchboard_price(account_info)?
                }
                PriceSourceType::Custom => {
                    // Custom oracle - assume first 8 bytes are price
                    read_custom_price(account_info)?
                }
            };

            if price > 0 {
                source.last_price = price;
                source.last_update = clock.unix_timestamp;
            }
        }
    }

    // Calculate aggregated price
    feed.current_price = feed.calculate_aggregated_price();
    feed.confidence = feed.calculate_confidence();
    feed.last_update = clock.unix_timestamp;

    msg!(
        "Aggregated price updated: {} (confidence: {})",
        feed.current_price,
        feed.confidence
    );

    Ok(())
}

// ============================================================================
// Helper functions for reading prices from different sources
// ============================================================================

fn read_sigma_price(account_info: &AccountInfo) -> Result<u64> {
    // Deserialize the PriceFeed account using Anchor's try_deserialize,
    // which correctly handles variable-length Borsh fields (e.g. asset_symbol: String).
    let data = account_info.try_borrow_data()?;
    let price_feed = PriceFeed::try_deserialize(&mut &data[..])?;

    Ok(price_feed.last_price)
}

fn read_pyth_price(account_info: &AccountInfo, _current_timestamp: i64) -> Result<u64> {
    let data = account_info.try_borrow_data()?;

    // Validate minimum size
    if data.len() < 224 {
        return Ok(0);
    }

    // Read expo (i32 at offset 20)
    let expo_bytes: [u8; 4] = data[20..24].try_into().map_err(|_| OracleError::InvalidPythFeed)?;
    let expo = i32::from_le_bytes(expo_bytes);

    // Read price (i64 at offset 208)
    let price_bytes: [u8; 8] = data[208..216].try_into().map_err(|_| OracleError::InvalidPythFeed)?;
    let price = i64::from_le_bytes(price_bytes);

    if price <= 0 {
        return Ok(0);
    }

    // Normalize to 1e6 scale
    let price_normalized = if expo >= 0 {
        (price as u64) * 10u64.pow(expo as u32) * 1_000_000
    } else {
        let divisor = 10i64.pow((-expo) as u32);
        ((price as i128 * 1_000_000) / divisor as i128) as u64
    };

    Ok(price_normalized)
}

fn read_switchboard_price(_account_info: &AccountInfo) -> Result<u64> {
    // Switchboard integration would go here
    // For now, return 0 (not implemented)
    Ok(0)
}

fn read_custom_price(account_info: &AccountInfo) -> Result<u64> {
    let data = account_info.try_borrow_data()?;

    if data.len() < 8 {
        return Ok(0);
    }

    // Assume first 8 bytes are u64 price
    let price_bytes: [u8; 8] = data[0..8].try_into().map_err(|_| OracleError::InvalidPriceFeed)?;
    let price = u64::from_le_bytes(price_bytes);

    Ok(price)
}
