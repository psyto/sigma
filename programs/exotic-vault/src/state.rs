use anchor_lang::prelude::*;

/// Exotic options vault state
#[account]
#[derive(InitSpace)]
pub struct ExoticVault {
    /// Vault authority
    pub authority: Pubkey,

    /// Collateral mint (USDC)
    pub collateral_mint: Pubkey,

    /// Underlying asset mint
    pub underlying_mint: Pubkey,

    /// Price feed from shared oracle
    pub price_feed: Pubkey,

    // ═══════════════════════════════════════════════════════════════════════
    // Vault Parameters
    // ═══════════════════════════════════════════════════════════════════════

    pub min_notional: u64,
    pub max_notional: u64,
    pub min_duration_days: u16,
    pub max_duration_days: u16,
    pub fee_rate_bps: u16,
    pub sample_interval_seconds: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // Vault Statistics
    // ═══════════════════════════════════════════════════════════════════════

    pub total_options: u64,
    pub total_volume: u128,
    pub total_premiums_collected: u64,
    pub total_fees_collected: u64,
    pub total_payouts: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // LP (Liquidity Provider) State
    // ═══════════════════════════════════════════════════════════════════════

    /// Total LP shares outstanding
    pub total_lp_shares: u64,

    /// Total liquidity in the vault
    pub total_liquidity: u64,

    /// Accumulated LP fees
    pub accumulated_lp_fees: u64,

    /// Active options count (for withdrawal limits)
    pub active_options: u64,

    /// Total exposure (sum of all active notional)
    pub total_exposure: u128,

    // ═══════════════════════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════════════════════

    pub is_active: bool,

    pub bump: u8,
    pub collateral_vault_bump: u8,
}

/// Liquidity provider account
#[account]
#[derive(InitSpace)]
pub struct LiquidityProvider {
    /// LP owner
    pub owner: Pubkey,

    /// Associated vault
    pub vault: Pubkey,

    /// LP shares owned
    pub shares: u64,

    /// Total deposited (for tracking)
    pub total_deposited: u64,

    /// Total withdrawn (for tracking)
    pub total_withdrawn: u64,

    /// Fees claimed
    pub fees_claimed: u64,

    /// Deposit timestamp
    pub deposited_at: i64,

    /// Last interaction timestamp
    pub last_interaction: i64,

    pub bump: u8,
}

/// Individual exotic option
#[account]
#[derive(InitSpace)]
pub struct ExoticOption {
    /// Option owner
    pub owner: Pubkey,

    /// Associated vault
    pub vault: Pubkey,

    /// Option index
    pub option_index: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // Option Parameters
    // ═══════════════════════════════════════════════════════════════════════

    /// Option type
    pub option_type: OptionType,

    /// Strike price (scaled by 1e6)
    pub strike_price: u64,

    /// Barrier price for barrier options (scaled by 1e6)
    pub barrier_price: Option<u64>,

    /// Notional amount
    pub notional: u64,

    /// Premium paid
    pub premium_paid: u64,

    // ═══════════════════════════════════════════════════════════════════════
    // Time Parameters
    // ═══════════════════════════════════════════════════════════════════════

    /// Duration in days
    pub duration_days: u16,

    /// Start timestamp
    pub start_time: i64,

    /// Expiry timestamp
    pub expiry_time: i64,

    // ═══════════════════════════════════════════════════════════════════════
    // Barrier State (for barrier options)
    // ═══════════════════════════════════════════════════════════════════════

    /// Whether barrier has been breached
    pub barrier_breached: bool,

    /// Time when barrier was breached
    pub barrier_breach_time: Option<i64>,

    /// Price when barrier was breached
    pub barrier_breach_price: Option<u64>,

    // ═══════════════════════════════════════════════════════════════════════
    // Settlement State
    // ═══════════════════════════════════════════════════════════════════════

    /// Settlement price (spot for barrier, TWAP for Asian)
    pub settlement_price: Option<u64>,

    /// Payout amount
    pub payout_amount: u64,

    /// Option status
    pub status: OptionStatus,

    /// Settlement timestamp
    pub settled_at: Option<i64>,

    pub bump: u8,
}

/// Price sample buffer for Asian options
#[account]
#[derive(InitSpace)]
pub struct PriceSampleBuffer {
    /// Associated option
    pub option: Pubkey,

    /// Price samples
    #[max_len(1000)]
    pub samples: Vec<PriceSample>,

    /// Calculated TWAP
    pub twap: u64,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct PriceSample {
    pub price: u64,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum OptionType {
    // Asian Options (TWAP-settled)
    AsianCall,
    AsianPut,

    // Knock-Out Barrier Options
    UpAndOutCall,    // Call that dies if price goes above barrier
    DownAndOutCall,  // Call that dies if price goes below barrier
    UpAndOutPut,     // Put that dies if price goes above barrier
    DownAndOutPut,   // Put that dies if price goes below barrier

    // Knock-In Barrier Options
    UpAndInCall,     // Call that activates if price goes above barrier
    DownAndInCall,   // Call that activates if price goes below barrier
    UpAndInPut,      // Put that activates if price goes above barrier
    DownAndInPut,    // Put that activates if price goes below barrier
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OptionStatus {
    Active,
    KnockedOut,      // Barrier breached (for knock-out)
    KnockedIn,       // Barrier breached (for knock-in)
    Settled,
    Claimed,
    Expired,         // Expired worthless
}

impl Default for OptionStatus {
    fn default() -> Self {
        OptionStatus::Active
    }
}

impl ExoticOption {
    /// Check if this is an Asian option
    pub fn is_asian(&self) -> bool {
        matches!(self.option_type, OptionType::AsianCall | OptionType::AsianPut)
    }

    /// Check if this is a barrier option
    pub fn is_barrier(&self) -> bool {
        !self.is_asian()
    }

    /// Check if this is a knock-out option
    pub fn is_knockout(&self) -> bool {
        matches!(
            self.option_type,
            OptionType::UpAndOutCall | OptionType::DownAndOutCall |
            OptionType::UpAndOutPut | OptionType::DownAndOutPut
        )
    }

    /// Check if this is a knock-in option
    pub fn is_knockin(&self) -> bool {
        matches!(
            self.option_type,
            OptionType::UpAndInCall | OptionType::DownAndInCall |
            OptionType::UpAndInPut | OptionType::DownAndInPut
        )
    }

    /// Check if this is an up-barrier
    pub fn is_up_barrier(&self) -> bool {
        matches!(
            self.option_type,
            OptionType::UpAndOutCall | OptionType::UpAndOutPut |
            OptionType::UpAndInCall | OptionType::UpAndInPut
        )
    }

    /// Check if barrier should trigger at given price
    pub fn should_trigger_barrier(&self, current_price: u64) -> bool {
        if let Some(barrier) = self.barrier_price {
            if self.is_up_barrier() {
                current_price >= barrier
            } else {
                current_price <= barrier
            }
        } else {
            false
        }
    }

    /// Calculate intrinsic value at settlement
    pub fn calculate_intrinsic_value(&self, settlement_price: u64) -> u64 {
        let is_call = matches!(
            self.option_type,
            OptionType::AsianCall | OptionType::UpAndOutCall | OptionType::DownAndOutCall |
            OptionType::UpAndInCall | OptionType::DownAndInCall
        );

        if is_call {
            if settlement_price > self.strike_price {
                // Call payoff = (S - K) / S * Notional
                ((settlement_price - self.strike_price) as u128 * self.notional as u128 / settlement_price as u128) as u64
            } else {
                0
            }
        } else {
            if settlement_price < self.strike_price {
                // Put payoff = (K - S) / K * Notional
                ((self.strike_price - settlement_price) as u128 * self.notional as u128 / self.strike_price as u128) as u64
            } else {
                0
            }
        }
    }
}

impl PriceSampleBuffer {
    /// Calculate TWAP from samples
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
}
