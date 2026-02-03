use anchor_lang::prelude::*;

/// Price feed configuration and current state
#[account]
#[derive(InitSpace)]
pub struct PriceFeed {
    /// Authority that can update this feed
    pub authority: Pubkey,

    /// Asset symbol (e.g., "SOL", "BTC")
    #[max_len(16)]
    pub asset_symbol: String,

    /// Asset mint address
    pub asset_mint: Pubkey,

    /// Minimum interval between samples (seconds)
    pub sample_interval_seconds: u64,

    /// Maximum samples to keep
    pub max_samples: u16,

    /// Current sample count
    pub sample_count: u16,

    /// Last sample timestamp
    pub last_sample_time: i64,

    /// Last recorded price (scaled by 1e6)
    pub last_price: u64,

    /// Time-weighted average price (scaled by 1e6)
    pub twap: u64,

    /// Feed creation time
    pub created_at: i64,

    /// Whether feed is active
    pub is_active: bool,

    pub bump: u8,
}

/// Buffer for storing price samples
#[account]
#[derive(InitSpace)]
pub struct SampleBuffer {
    /// Associated price feed
    pub price_feed: Pubkey,

    /// Price samples
    #[max_len(10000)]
    pub samples: Vec<PriceSample>,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct PriceSample {
    /// Price (scaled by 1e6)
    pub price: u64,
    /// Unix timestamp
    pub timestamp: i64,
}

impl SampleBuffer {
    /// Calculate time-weighted average price
    pub fn calculate_twap(&self) -> u64 {
        if self.samples.is_empty() {
            return 0;
        }

        if self.samples.len() == 1 {
            return self.samples[0].price;
        }

        let mut weighted_sum: u128 = 0;
        let mut total_time: u128 = 0;

        for i in 1..self.samples.len() {
            let time_delta = (self.samples[i].timestamp - self.samples[i - 1].timestamp) as u128;
            let avg_price = ((self.samples[i].price as u128) + (self.samples[i - 1].price as u128)) / 2;
            weighted_sum += avg_price * time_delta;
            total_time += time_delta;
        }

        if total_time == 0 {
            return self.samples.last().unwrap().price;
        }

        (weighted_sum / total_time) as u64
    }

    /// Calculate realized variance from samples
    /// Returns variance in basis points (annualized)
    pub fn calculate_realized_variance(&self, interval_seconds: u64) -> u64 {
        if self.samples.len() < 2 {
            return 0;
        }

        let mut sum_squared_returns: u128 = 0;

        for i in 1..self.samples.len() {
            let prev_price = self.samples[i - 1].price as u128;
            let curr_price = self.samples[i].price as u128;

            if prev_price == 0 {
                continue;
            }

            // Calculate log return approximation: (P1 - P0) / P0
            // Scaled by 1e8 for precision
            let return_scaled = if curr_price >= prev_price {
                ((curr_price - prev_price) * 100_000_000) / prev_price
            } else {
                ((prev_price - curr_price) * 100_000_000) / prev_price
            };

            sum_squared_returns += return_scaled * return_scaled;
        }

        let n = (self.samples.len() - 1) as u128;
        if n == 0 {
            return 0;
        }

        // Annualize: variance * (seconds_per_year / interval)
        let seconds_per_year: u128 = 365 * 24 * 3600;
        let annualization_factor = seconds_per_year / interval_seconds as u128;

        // Result in basis points
        let variance_bps = (sum_squared_returns * annualization_factor) / (n * 100_000_000 * 100);

        variance_bps as u64
    }
}

/// Funding rate feed for perpetual markets
#[account]
#[derive(InitSpace)]
pub struct FundingFeed {
    /// Authority that can update this feed
    pub authority: Pubkey,

    /// Market symbol (e.g., "SOL-PERP")
    #[max_len(16)]
    pub market_symbol: String,

    /// Current funding rate in basis points (can be negative)
    pub current_rate_bps: i16,

    /// Last update timestamp
    pub last_update: i64,

    /// Historical funding rates (last 100)
    #[max_len(100)]
    pub rate_history: Vec<FundingRateSample>,

    /// Whether feed is active
    pub is_active: bool,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct FundingRateSample {
    /// Funding rate in basis points (can be negative)
    pub rate_bps: i16,
    /// Unix timestamp
    pub timestamp: i64,
}

impl FundingFeed {
    /// Calculate average funding rate over history
    pub fn calculate_average_rate(&self) -> i16 {
        if self.rate_history.is_empty() {
            return 0;
        }

        let sum: i32 = self.rate_history.iter().map(|s| s.rate_bps as i32).sum();
        (sum / self.rate_history.len() as i32) as i16
    }

    /// Calculate funding rate volatility
    pub fn calculate_rate_volatility(&self) -> u16 {
        if self.rate_history.len() < 2 {
            return 0;
        }

        let avg = self.calculate_average_rate() as i32;
        let variance: u32 = self.rate_history
            .iter()
            .map(|s| {
                let diff = (s.rate_bps as i32) - avg;
                (diff * diff) as u32
            })
            .sum::<u32>() / (self.rate_history.len() as u32 - 1);

        // Return standard deviation in bps
        (variance as f64).sqrt() as u16
    }
}
