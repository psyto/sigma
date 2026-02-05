use anchor_lang::prelude::*;

// ============================================================================
// Price Feed
// ============================================================================

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

    /// Optional Pyth price feed account
    pub pyth_feed: Option<Pubkey>,

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

    /// Exponential moving average price (scaled by 1e6)
    pub ema: u64,

    /// Current realized variance (annualized, in bps)
    pub current_variance: u64,

    /// Maximum price in current period
    pub period_high: u64,

    /// Minimum price in current period
    pub period_low: u64,

    /// Feed creation time
    pub created_at: i64,

    /// Whether feed is active
    pub is_active: bool,

    /// Maximum staleness allowed (seconds)
    pub max_staleness_seconds: u64,

    pub bump: u8,
}

impl PriceFeed {
    /// Check if the price is stale
    pub fn is_stale(&self, current_time: i64) -> bool {
        if self.max_staleness_seconds == 0 {
            return false;
        }
        current_time - self.last_sample_time > self.max_staleness_seconds as i64
    }

    /// Get confidence interval around price (rough estimate based on variance)
    pub fn get_confidence_interval(&self) -> (u64, u64) {
        // 2 standard deviations (95% confidence)
        let std_dev = ((self.current_variance as f64).sqrt() / 100.0 * self.last_price as f64) as u64;
        let low = self.last_price.saturating_sub(std_dev * 2);
        let high = self.last_price.saturating_add(std_dev * 2);
        (low, high)
    }
}

// ============================================================================
// Sample Buffer
// ============================================================================

/// Buffer for storing price samples
#[account]
#[derive(InitSpace)]
pub struct SampleBuffer {
    /// Associated price feed
    pub price_feed: Pubkey,

    /// Price samples (circular buffer)
    #[max_len(10000)]
    pub samples: Vec<PriceSample>,

    /// Index of oldest sample (for circular buffer)
    pub head_index: u16,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
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

    /// Calculate TWAP over a specific time window
    pub fn calculate_twap_window(&self, window_start: i64, window_end: i64) -> u64 {
        let filtered: Vec<&PriceSample> = self
            .samples
            .iter()
            .filter(|s| s.timestamp >= window_start && s.timestamp <= window_end)
            .collect();

        if filtered.is_empty() {
            return 0;
        }

        if filtered.len() == 1 {
            return filtered[0].price;
        }

        let mut weighted_sum: u128 = 0;
        let mut total_time: u128 = 0;

        for i in 1..filtered.len() {
            let time_delta = (filtered[i].timestamp - filtered[i - 1].timestamp) as u128;
            let avg_price = ((filtered[i].price as u128) + (filtered[i - 1].price as u128)) / 2;
            weighted_sum += avg_price * time_delta;
            total_time += time_delta;
        }

        if total_time == 0 {
            return filtered.last().unwrap().price;
        }

        (weighted_sum / total_time) as u64
    }

    /// Calculate exponential moving average
    /// Alpha is the smoothing factor (0-10000, where 10000 = 1.0)
    pub fn calculate_ema(&self, alpha: u16) -> u64 {
        if self.samples.is_empty() {
            return 0;
        }

        let alpha_scaled = alpha as u128;
        let one_minus_alpha = 10000u128 - alpha_scaled;

        let mut ema: u128 = self.samples[0].price as u128 * 10000;

        for sample in self.samples.iter().skip(1) {
            ema = alpha_scaled * sample.price as u128 + one_minus_alpha * ema / 10000;
        }

        (ema / 10000) as u64
    }

    /// Calculate realized variance from samples
    /// Returns variance in basis points (annualized)
    pub fn calculate_realized_variance(&self, interval_seconds: u64) -> u64 {
        if self.samples.len() < 2 {
            return 0;
        }

        let mut sum_squared_returns: u128 = 0;
        let mut valid_samples = 0u64;

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
            valid_samples += 1;
        }

        if valid_samples == 0 {
            return 0;
        }

        // Annualize: variance * (seconds_per_year / interval)
        let seconds_per_year: u128 = 365 * 24 * 3600;
        let annualization_factor = seconds_per_year / interval_seconds as u128;

        // Result in basis points
        let variance_bps = (sum_squared_returns * annualization_factor) / (valid_samples as u128 * 100_000_000 * 100);

        variance_bps as u64
    }

    /// Calculate min/max prices in buffer
    pub fn get_min_max(&self) -> (u64, u64) {
        if self.samples.is_empty() {
            return (0, 0);
        }

        let mut min = u64::MAX;
        let mut max = 0u64;

        for sample in &self.samples {
            if sample.price < min {
                min = sample.price;
            }
            if sample.price > max {
                max = sample.price;
            }
        }

        (min, max)
    }

    /// Get samples within a time range
    pub fn get_samples_in_range(&self, start: i64, end: i64) -> Vec<PriceSample> {
        self.samples
            .iter()
            .filter(|s| s.timestamp >= start && s.timestamp <= end)
            .copied()
            .collect()
    }
}

// ============================================================================
// Funding Feed
// ============================================================================

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
    /// Positive = longs pay shorts, Negative = shorts pay longs
    pub current_rate_bps: i64,

    /// Cumulative funding since inception (scaled by 1e9)
    pub cumulative_funding: i128,

    /// Funding interval in seconds (e.g., 3600 for hourly, 28800 for 8-hour)
    pub funding_interval_seconds: u64,

    /// Last update timestamp
    pub last_update: i64,

    /// Total funding periods recorded
    pub total_periods: u64,

    /// Historical funding rates (last 168 = 1 week of hourly)
    #[max_len(168)]
    pub rate_history: Vec<FundingRateSample>,

    /// Whether feed is active
    pub is_active: bool,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct FundingRateSample {
    /// Funding rate in basis points (can be negative)
    pub rate_bps: i64,
    /// Unix timestamp
    pub timestamp: i64,
}

impl FundingFeed {
    /// Calculate average funding rate over history
    pub fn calculate_average_rate(&self) -> i64 {
        if self.rate_history.is_empty() {
            return 0;
        }

        let sum: i128 = self.rate_history.iter().map(|s| s.rate_bps as i128).sum();
        (sum / self.rate_history.len() as i128) as i64
    }

    /// Calculate average funding rate over last N periods
    pub fn calculate_average_rate_n(&self, n: usize) -> i64 {
        if self.rate_history.is_empty() {
            return 0;
        }

        let samples: Vec<&FundingRateSample> = self.rate_history.iter().rev().take(n).collect();
        if samples.is_empty() {
            return 0;
        }

        let sum: i128 = samples.iter().map(|s| s.rate_bps as i128).sum();
        (sum / samples.len() as i128) as i64
    }

    /// Calculate funding rate volatility (standard deviation in bps)
    pub fn calculate_rate_volatility(&self) -> u64 {
        if self.rate_history.len() < 2 {
            return 0;
        }

        let avg = self.calculate_average_rate() as i128;
        let variance: u128 = self
            .rate_history
            .iter()
            .map(|s| {
                let diff = (s.rate_bps as i128) - avg;
                (diff * diff) as u128
            })
            .sum::<u128>()
            / (self.rate_history.len() as u128 - 1);

        // Return standard deviation in bps
        (variance as f64).sqrt() as u64
    }

    /// Annualized funding rate (assuming current rate persists)
    pub fn calculate_annualized_rate(&self) -> i64 {
        let periods_per_year = (365 * 24 * 3600) / self.funding_interval_seconds;
        self.current_rate_bps * periods_per_year as i64
    }

    /// Get predicted funding based on recent trend
    pub fn predict_next_rate(&self) -> i64 {
        if self.rate_history.len() < 3 {
            return self.current_rate_bps;
        }

        // Simple linear regression on last 10 samples
        let samples: Vec<&FundingRateSample> = self.rate_history.iter().rev().take(10).collect();
        let n = samples.len() as i64;

        let sum_x: i64 = (0..n).sum();
        let sum_y: i64 = samples.iter().map(|s| s.rate_bps).sum();
        let sum_xy: i64 = samples.iter().enumerate().map(|(i, s)| (i as i64) * s.rate_bps).sum();
        let sum_xx: i64 = (0..n).map(|x| x * x).sum();

        let denom = n * sum_xx - sum_x * sum_x;
        if denom == 0 {
            return self.current_rate_bps;
        }

        let slope = (n * sum_xy - sum_x * sum_y) / denom;
        let intercept = (sum_y - slope * sum_x) / n;

        // Predict next value
        intercept + slope * n
    }
}

// ============================================================================
// Aggregated Feed
// ============================================================================

/// Aggregated price feed from multiple sources
#[account]
#[derive(InitSpace)]
pub struct AggregatedFeed {
    /// Authority that can manage this feed
    pub authority: Pubkey,

    /// Asset symbol
    #[max_len(16)]
    pub asset_symbol: String,

    /// Aggregation method
    pub aggregation_method: AggregationMethod,

    /// Price sources
    #[max_len(8)]
    pub sources: Vec<PriceSource>,

    /// Current aggregated price
    pub current_price: u64,

    /// Confidence score (0-10000)
    pub confidence: u16,

    /// Last update timestamp
    pub last_update: i64,

    /// Whether feed is active
    pub is_active: bool,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum AggregationMethod {
    /// Simple average of all sources
    Mean,
    /// Median value
    Median,
    /// Weighted average based on source weights
    WeightedMean,
    /// Minimum of all sources (conservative)
    Min,
    /// Maximum of all sources
    Max,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct PriceSource {
    /// Source account address
    pub account: Pubkey,
    /// Source type
    pub source_type: PriceSourceType,
    /// Weight for weighted aggregation (0-10000)
    pub weight: u16,
    /// Last price from this source
    pub last_price: u64,
    /// Last update time
    pub last_update: i64,
    /// Whether source is active
    pub is_active: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum PriceSourceType {
    /// Internal Sigma price feed
    SigmaFeed,
    /// Pyth Network
    Pyth,
    /// Switchboard
    Switchboard,
    /// Custom oracle
    Custom,
}

impl AggregatedFeed {
    /// Calculate aggregated price from sources
    pub fn calculate_aggregated_price(&self) -> u64 {
        let active_sources: Vec<&PriceSource> = self
            .sources
            .iter()
            .filter(|s| s.is_active && s.last_price > 0)
            .collect();

        if active_sources.is_empty() {
            return 0;
        }

        match self.aggregation_method {
            AggregationMethod::Mean => {
                let sum: u128 = active_sources.iter().map(|s| s.last_price as u128).sum();
                (sum / active_sources.len() as u128) as u64
            }
            AggregationMethod::Median => {
                let mut prices: Vec<u64> = active_sources.iter().map(|s| s.last_price).collect();
                prices.sort();
                if prices.len() % 2 == 0 {
                    (prices[prices.len() / 2 - 1] + prices[prices.len() / 2]) / 2
                } else {
                    prices[prices.len() / 2]
                }
            }
            AggregationMethod::WeightedMean => {
                let weighted_sum: u128 = active_sources
                    .iter()
                    .map(|s| s.last_price as u128 * s.weight as u128)
                    .sum();
                let weight_sum: u128 = active_sources.iter().map(|s| s.weight as u128).sum();
                if weight_sum == 0 {
                    return 0;
                }
                (weighted_sum / weight_sum) as u64
            }
            AggregationMethod::Min => active_sources.iter().map(|s| s.last_price).min().unwrap_or(0),
            AggregationMethod::Max => active_sources.iter().map(|s| s.last_price).max().unwrap_or(0),
        }
    }

    /// Calculate confidence based on source agreement
    pub fn calculate_confidence(&self) -> u16 {
        let active_sources: Vec<&PriceSource> = self
            .sources
            .iter()
            .filter(|s| s.is_active && s.last_price > 0)
            .collect();

        if active_sources.len() < 2 {
            return if active_sources.len() == 1 { 5000 } else { 0 };
        }

        let avg = self.calculate_aggregated_price();
        if avg == 0 {
            return 0;
        }

        // Calculate average deviation from mean
        let total_deviation: u128 = active_sources
            .iter()
            .map(|s| {
                if s.last_price > avg {
                    (s.last_price - avg) as u128
                } else {
                    (avg - s.last_price) as u128
                }
            })
            .sum();

        let avg_deviation = total_deviation / active_sources.len() as u128;
        let deviation_percent = (avg_deviation * 10000 / avg as u128) as u16;

        // Higher deviation = lower confidence
        // Max confidence when deviation < 0.1%
        if deviation_percent > 1000 {
            0
        } else {
            10000 - deviation_percent * 10
        }
    }
}

// ============================================================================
// Variance Tracker
// ============================================================================

/// Tracks realized variance across epochs for VolSwap
#[account]
#[derive(InitSpace)]
pub struct VarianceTracker {
    /// Associated price feed
    pub price_feed: Pubkey,

    /// Authority
    pub authority: Pubkey,

    /// Current epoch number
    pub current_epoch: u64,

    /// Epoch duration in seconds
    pub epoch_duration_seconds: u64,

    /// Current epoch start time
    pub epoch_start_time: i64,

    /// Realized variance for current epoch (bps, annualized)
    pub current_epoch_variance: u64,

    /// Sample count for current epoch
    pub current_epoch_samples: u32,

    /// Start price index in sample buffer for this epoch
    pub epoch_start_sample_index: u32,

    /// Historical epoch variances
    #[max_len(52)]
    pub epoch_history: Vec<EpochVariance>,

    /// Whether epoch is finalized
    pub is_epoch_finalized: bool,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct EpochVariance {
    /// Epoch number
    pub epoch: u64,
    /// Realized variance (bps, annualized)
    pub variance: u64,
    /// Epoch start timestamp
    pub start_time: i64,
    /// Epoch end timestamp
    pub end_time: i64,
    /// Number of samples used
    pub sample_count: u32,
}

impl VarianceTracker {
    /// Check if current epoch has ended
    pub fn is_epoch_ended(&self, current_time: i64) -> bool {
        current_time >= self.epoch_start_time + self.epoch_duration_seconds as i64
    }

    /// Get time remaining in current epoch
    pub fn time_remaining(&self, current_time: i64) -> i64 {
        let epoch_end = self.epoch_start_time + self.epoch_duration_seconds as i64;
        if current_time >= epoch_end {
            0
        } else {
            epoch_end - current_time
        }
    }

    /// Calculate average historical variance
    pub fn calculate_average_variance(&self) -> u64 {
        if self.epoch_history.is_empty() {
            return 0;
        }

        let sum: u128 = self.epoch_history.iter().map(|e| e.variance as u128).sum();
        (sum / self.epoch_history.len() as u128) as u64
    }

    /// Calculate variance of variance (vol of vol)
    pub fn calculate_variance_volatility(&self) -> u64 {
        if self.epoch_history.len() < 2 {
            return 0;
        }

        let avg = self.calculate_average_variance() as i128;
        let variance: u128 = self
            .epoch_history
            .iter()
            .map(|e| {
                let diff = (e.variance as i128) - avg;
                (diff * diff) as u128
            })
            .sum::<u128>()
            / (self.epoch_history.len() as u128 - 1);

        (variance as f64).sqrt() as u64
    }
}

// ============================================================================
// Sigma Volatility Index (SVI)
// ============================================================================

/// Sigma Volatility Index - comparable to Volmex SVIV
/// Tracks implied and realized volatility for an asset
#[account]
#[derive(InitSpace)]
pub struct VolatilityIndex {
    /// Authority that can manage this index
    pub authority: Pubkey,

    /// Asset symbol (e.g., "SOL", "BTC", "ETH")
    #[max_len(16)]
    pub asset_symbol: String,

    /// Index name (e.g., "SVI-SOL-14D")
    #[max_len(32)]
    pub index_name: String,

    /// Associated price feed
    pub price_feed: Pubkey,

    /// Associated variance tracker
    pub variance_tracker: Pubkey,

    /// Duration in days (14 or 30 typically)
    pub duration_days: u8,

    /// Current index value (annualized vol in bps, e.g., 4500 = 45%)
    pub current_value: u64,

    /// 24h high
    pub high_24h: u64,

    /// 24h low
    pub low_24h: u64,

    /// 24h change in bps (can be negative)
    pub change_24h_bps: i64,

    /// 7-day average
    pub avg_7d: u64,

    /// 30-day average
    pub avg_30d: u64,

    /// Realized volatility component (weight in calculation)
    pub realized_vol: u64,

    /// Implied volatility component (from options if available)
    pub implied_vol: u64,

    /// Implied vol weight (0-10000, rest is realized)
    pub implied_weight: u16,

    /// Historical index values (hourly for 7 days = 168)
    #[max_len(168)]
    pub index_history: Vec<VolatilityIndexSample>,

    /// Last update timestamp
    pub last_update: i64,

    /// Index creation time
    pub created_at: i64,

    /// Whether index is active
    pub is_active: bool,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct VolatilityIndexSample {
    /// Index value (annualized vol in bps)
    pub value: u64,
    /// Unix timestamp
    pub timestamp: i64,
}

impl VolatilityIndex {
    /// Calculate the current index value from realized and implied vol
    pub fn calculate_index_value(&self) -> u64 {
        let implied_component = (self.implied_vol as u128 * self.implied_weight as u128) / 10000;
        let realized_component = (self.realized_vol as u128 * (10000 - self.implied_weight as u128)) / 10000;
        (implied_component + realized_component) as u64
    }

    /// Calculate percentile rank (where current value sits in history)
    pub fn calculate_percentile(&self) -> u8 {
        if self.index_history.is_empty() {
            return 50;
        }

        let count_below = self.index_history
            .iter()
            .filter(|s| s.value < self.current_value)
            .count();

        ((count_below * 100) / self.index_history.len()) as u8
    }

    /// Get volatility regime classification
    pub fn get_volatility_regime(&self) -> VolatilityRegime {
        match self.current_value {
            0..=2000 => VolatilityRegime::VeryLow,      // <20%
            2001..=3500 => VolatilityRegime::Low,       // 20-35%
            3501..=5000 => VolatilityRegime::Normal,    // 35-50%
            5001..=7500 => VolatilityRegime::High,      // 50-75%
            _ => VolatilityRegime::Extreme,             // >75%
        }
    }

    /// Check if volatility is mean-reverting (potential short opportunity)
    pub fn is_elevated(&self) -> bool {
        self.current_value > self.avg_30d + (self.avg_30d / 4) // 25% above 30d avg
    }

    /// Check if volatility is depressed (potential long opportunity)
    pub fn is_depressed(&self) -> bool {
        self.current_value < self.avg_30d.saturating_sub(self.avg_30d / 4) // 25% below 30d avg
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum VolatilityRegime {
    VeryLow,
    Low,
    Normal,
    High,
    Extreme,
}

// ============================================================================
// CEX Funding Rate Feed
// ============================================================================

/// CEX Funding Rate aggregator - combines funding rates from multiple exchanges
#[account]
#[derive(InitSpace)]
pub struct CexFundingFeed {
    /// Authority that can manage this feed
    pub authority: Pubkey,

    /// Market symbol (e.g., "SOL-PERP")
    #[max_len(16)]
    pub market_symbol: String,

    /// Exchange sources for funding rates
    #[max_len(8)]
    pub exchange_sources: Vec<ExchangeFundingSource>,

    /// Aggregated current funding rate (bps)
    pub aggregated_rate_bps: i64,

    /// Aggregation method
    pub aggregation_method: FundingAggregationMethod,

    /// Total open interest across exchanges (USD, scaled by 1e6)
    pub total_open_interest: u64,

    /// Open interest weighted rate
    pub oi_weighted_rate_bps: i64,

    /// Historical aggregated rates
    #[max_len(168)]
    pub rate_history: Vec<CexFundingRateSample>,

    /// Last update timestamp
    pub last_update: i64,

    /// Whether feed is active
    pub is_active: bool,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct ExchangeFundingSource {
    /// Exchange identifier
    pub exchange: CexExchange,
    /// Current funding rate (bps)
    pub current_rate_bps: i64,
    /// Next funding time
    pub next_funding_time: i64,
    /// Funding interval (seconds)
    pub funding_interval: u64,
    /// Open interest (USD, scaled by 1e6)
    pub open_interest: u64,
    /// Last update timestamp
    pub last_update: i64,
    /// Whether source is active
    pub is_active: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum CexExchange {
    Binance,
    Bybit,
    OKX,
    Deribit,
    Bitget,
    Kraken,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum FundingAggregationMethod {
    /// Simple average
    Mean,
    /// Median value
    Median,
    /// Weighted by open interest
    OpenInterestWeighted,
    /// Use the exchange with highest OI
    HighestOI,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct CexFundingRateSample {
    /// Aggregated rate (bps)
    pub rate_bps: i64,
    /// OI-weighted rate (bps)
    pub oi_weighted_rate_bps: i64,
    /// Total OI at sample time
    pub total_oi: u64,
    /// Unix timestamp
    pub timestamp: i64,
}

impl CexFundingFeed {
    /// Calculate aggregated funding rate from exchange sources
    pub fn calculate_aggregated_rate(&self) -> i64 {
        let active_sources: Vec<&ExchangeFundingSource> = self
            .exchange_sources
            .iter()
            .filter(|s| s.is_active)
            .collect();

        if active_sources.is_empty() {
            return 0;
        }

        match self.aggregation_method {
            FundingAggregationMethod::Mean => {
                let sum: i128 = active_sources.iter().map(|s| s.current_rate_bps as i128).sum();
                (sum / active_sources.len() as i128) as i64
            }
            FundingAggregationMethod::Median => {
                let mut rates: Vec<i64> = active_sources.iter().map(|s| s.current_rate_bps).collect();
                rates.sort();
                if rates.len() % 2 == 0 {
                    (rates[rates.len() / 2 - 1] + rates[rates.len() / 2]) / 2
                } else {
                    rates[rates.len() / 2]
                }
            }
            FundingAggregationMethod::OpenInterestWeighted => {
                let weighted_sum: i128 = active_sources
                    .iter()
                    .map(|s| s.current_rate_bps as i128 * s.open_interest as i128)
                    .sum();
                let oi_sum: u128 = active_sources.iter().map(|s| s.open_interest as u128).sum();
                if oi_sum == 0 {
                    return 0;
                }
                (weighted_sum / oi_sum as i128) as i64
            }
            FundingAggregationMethod::HighestOI => {
                active_sources
                    .iter()
                    .max_by_key(|s| s.open_interest)
                    .map(|s| s.current_rate_bps)
                    .unwrap_or(0)
            }
        }
    }

    /// Calculate annualized funding rate
    pub fn calculate_annualized_rate(&self) -> i64 {
        // Assuming 8-hour funding intervals (3 per day)
        self.aggregated_rate_bps * 3 * 365
    }

    /// Get the exchange with highest funding rate
    pub fn get_highest_rate_exchange(&self) -> Option<(CexExchange, i64)> {
        self.exchange_sources
            .iter()
            .filter(|s| s.is_active)
            .max_by_key(|s| s.current_rate_bps)
            .map(|s| (s.exchange, s.current_rate_bps))
    }

    /// Get the exchange with lowest funding rate
    pub fn get_lowest_rate_exchange(&self) -> Option<(CexExchange, i64)> {
        self.exchange_sources
            .iter()
            .filter(|s| s.is_active)
            .min_by_key(|s| s.current_rate_bps)
            .map(|s| (s.exchange, s.current_rate_bps))
    }

    /// Calculate funding rate spread (max - min)
    pub fn calculate_rate_spread(&self) -> i64 {
        let active_rates: Vec<i64> = self
            .exchange_sources
            .iter()
            .filter(|s| s.is_active)
            .map(|s| s.current_rate_bps)
            .collect();

        if active_rates.is_empty() {
            return 0;
        }

        let max = active_rates.iter().max().unwrap_or(&0);
        let min = active_rates.iter().min().unwrap_or(&0);
        max - min
    }
}

// ============================================================================
// Secondary Market - Position NFT
// ============================================================================

/// Position token representing a tradeable position in any Sigma protocol
#[account]
#[derive(InitSpace)]
pub struct PositionToken {
    /// Owner of this position token
    pub owner: Pubkey,

    /// Protocol type
    pub protocol: SigmaProtocol,

    /// Original position account
    pub position_account: Pubkey,

    /// Position details hash (for verification)
    pub position_hash: [u8; 32],

    /// Notional value (USD, scaled by 1e6)
    pub notional: u64,

    /// Current mark-to-market value (USD, scaled by 1e6)
    pub mark_to_market: i64,

    /// Expiry timestamp
    pub expiry: i64,

    /// Position direction
    pub direction: PositionDirection,

    /// Strike/fixed rate (meaning depends on protocol)
    pub strike: u64,

    /// Creation timestamp
    pub created_at: i64,

    /// Whether position is listed for sale
    pub is_listed: bool,

    /// Listing price (if listed, in USDC scaled by 1e6)
    pub listing_price: u64,

    /// Minimum acceptable price for auction
    pub min_price: u64,

    /// Whether this position token is valid/active
    pub is_active: bool,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum SigmaProtocol {
    VolSwap,
    FundingSwap,
    ExoticVault,
}

impl SigmaProtocol {
    /// Get bytes for use in PDA seeds
    pub fn seed_bytes(&self) -> [u8; 16] {
        match self {
            SigmaProtocol::VolSwap => *b"volswap_________",
            SigmaProtocol::FundingSwap => *b"fundingswap_____",
            SigmaProtocol::ExoticVault => *b"exoticvault_____",
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum PositionDirection {
    Long,
    Short,
}

impl PositionToken {
    /// Check if position has expired
    pub fn is_expired(&self, current_time: i64) -> bool {
        current_time >= self.expiry
    }

    /// Calculate time to expiry
    pub fn time_to_expiry(&self, current_time: i64) -> i64 {
        if current_time >= self.expiry {
            0
        } else {
            self.expiry - current_time
        }
    }

    /// Calculate implied discount/premium based on listing vs MTM
    pub fn calculate_listing_discount(&self) -> i64 {
        if self.mark_to_market == 0 {
            return 0;
        }
        // Positive = discount, Negative = premium
        ((self.mark_to_market - self.listing_price as i64) * 10000) / self.mark_to_market
    }
}

/// Secondary market orderbook for position tokens
#[account]
#[derive(InitSpace)]
pub struct SecondaryMarket {
    /// Authority
    pub authority: Pubkey,

    /// Protocol this market serves
    pub protocol: SigmaProtocol,

    /// Active listings
    #[max_len(100)]
    pub listings: Vec<MarketListing>,

    /// Total volume traded (USD, scaled by 1e6)
    pub total_volume: u64,

    /// Total trades executed
    pub total_trades: u64,

    /// Fee rate (bps)
    pub fee_rate_bps: u16,

    /// Fee recipient
    pub fee_recipient: Pubkey,

    /// Whether market is active
    pub is_active: bool,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct MarketListing {
    /// Position token account
    pub position_token: Pubkey,
    /// Seller
    pub seller: Pubkey,
    /// Asking price (USDC, scaled by 1e6)
    pub price: u64,
    /// Listing timestamp
    pub listed_at: i64,
    /// Expiry of listing (0 = no expiry)
    pub listing_expiry: i64,
    /// Whether listing is active
    pub is_active: bool,
}

impl SecondaryMarket {
    /// Get active listings sorted by price (lowest first)
    pub fn get_sorted_listings(&self) -> Vec<&MarketListing> {
        let mut active: Vec<&MarketListing> = self
            .listings
            .iter()
            .filter(|l| l.is_active)
            .collect();
        active.sort_by_key(|l| l.price);
        active
    }

    /// Calculate average listing price
    pub fn calculate_avg_price(&self) -> u64 {
        let active: Vec<&MarketListing> = self
            .listings
            .iter()
            .filter(|l| l.is_active)
            .collect();

        if active.is_empty() {
            return 0;
        }

        let sum: u128 = active.iter().map(|l| l.price as u128).sum();
        (sum / active.len() as u128) as u64
    }

    /// Get number of active listings
    pub fn active_listing_count(&self) -> usize {
        self.listings.iter().filter(|l| l.is_active).count()
    }
}
