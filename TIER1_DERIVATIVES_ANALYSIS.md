# Tier 1 Deep Dive: Cutting-Edge Derivative Opportunities

> **Generated:** 2026-02-03
> **Author:** Claude Code Analysis
> **Purpose:** Cross-breeding existing repositories for novel DeFi derivatives

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Your DeFi Building Blocks Inventory](#your-defi-building-blocks-inventory)
3. [VolSwap Protocol — Variance Swaps & Volatility Index](#1-volswap-protocol--variance-swaps--volatility-index)
4. [FundingSwap — Funding Rate Derivatives](#2-fundingswap--funding-rate-derivatives)
5. [ExoticVault — Asian & Barrier Options](#3-exoticvault--asian--barrier-options)
6. [Comparison Matrix](#comparison-matrix)
7. [Recommended Priority](#recommended-priority)
8. [Sources](#sources)

---

## Executive Summary

Based on comprehensive research and analysis of your existing codebases, this document provides detailed specifications for three high-impact, low-competition derivative protocols you can build by cross-breeding your existing repos.

**Key Findings:**
- Volatility derivatives (variance swaps) are virtually non-existent in DeFi
- Funding rate derivatives have zero implementations despite massive perp markets
- Exotic options (Asian, Barrier) have only one competitor (Cega) with limited scope
- Your existing repos provide 80%+ of the infrastructure needed

---

## Your DeFi Building Blocks Inventory

| Repository | Core Primitives | Chain |
|------------|-----------------|-------|
| **DeFi** | AMM, LP tokens, constant product swaps | Ethereum |
| **kalshify** | Binary prediction markets, AI recommendations, signal detection | Kalshi API |
| **titanus** | RWA tokenization, telematics oracle, auto-settlement, geofencing | Solana |
| **continuum** | Repo transactions, JPY stablecoin, KYC/Transfer hooks, collateralized lending | Solana |
| **veil-solana** | Encrypted orders, dark pools, ZK proofs, shielded transfers, Arcium MPC | Solana |
| **lending** | Collateral ratios, liquidation thresholds, share-based accounting | Solana |
| **indie-star-market** | Binary outcome tokens, AMM pricing, settlement/redemption | Solana |
| **deltavault** | Covered call vault, Pyth oracle, weekly rebalancing | Solana |
| **solana-arbitrage** | Multi-DEX price fetching, arbitrage detection, LP management | Solana |
| **cross-dex-aggregator** | Jupiter routing, slippage control, route optimization | Solana |
| **komon** | Direction markets, reputation/soulbound tokens, treasury | Solana |
| **escrow** | 3-party settlement, arbitration | Ethereum |
| **dverse** | Perp/options analytics, funding rates, liquidation tracking | Solana |

---

## 1. VolSwap Protocol — Variance Swaps & Volatility Index

### Market Analysis

**Current State of Crypto Volatility Derivatives:**
- Bitcoin Volatility Index (BVIV) tracks 30-day implied volatility from options
- The BVIV-VIX spread is widening (Dec 2025), indicating crypto volatility premium over equities
- Variance swaps and volatility derivatives are prominent in TradFi but **virtually non-existent in DeFi**
- DL News State of DeFi 2025 notes derivatives (excl. perps) have "limited adoption and lack of established product-market fit"

**Why This Is Underexplored:**
1. Requires continuous price sampling (not just spot prices)
2. Complex payoff calculations (variance = sum of squared returns)
3. No established oracle for realized volatility on-chain
4. Hedging variance swaps requires dynamic delta hedging

### Product Specification

**Core Product: Variance Swap**
- **Payoff**: `Notional × (RealizedVariance - StrikeVariance)`
- **Long Side**: Profits when actual volatility exceeds expected
- **Short Side**: Profits when actual volatility stays below expected (collect premium)

**Secondary Product: Volatility Index Token (sVOL)**
- Tokenized exposure to 30-day rolling realized volatility
- Can be longed/shorted like any token
- Enables volatility ETF-like products

### Technical Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         VOLSWAP PROTOCOL                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐ │
│   │  Price Oracle    │───▶│ Volatility       │───▶│ Variance Swap   │ │
│   │  Service         │    │ Calculator       │    │ Engine          │ │
│   │                  │    │                  │    │                 │ │
│   │ - Pyth prices    │    │ - TWAP calc      │    │ - Long/Short    │ │
│   │ - Multi-DEX      │    │ - Return calc    │    │ - Settlement    │ │
│   │ - 5-min samples  │    │ - RV aggregation │    │ - Margin        │ │
│   └──────────────────┘    └──────────────────┘    └─────────────────┘ │
│          │                        │                       │           │
│          ▼                        ▼                       ▼           │
│   ┌──────────────────────────────────────────────────────────────────┐│
│   │                    Vault & Collateral Layer                      ││
│   │   (From deltavault: deposit/withdraw/shares, Pyth integration)   ││
│   └──────────────────────────────────────────────────────────────────┘│
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Cross-Breeding Your Repos

| Component | Source Repo | Files to Reuse |
|-----------|-------------|----------------|
| **Vault Structure** | `deltavault` | `programs/deltavault/src/lib.rs` - deposit/withdraw/shares logic |
| **Pyth Oracle** | `deltavault` | Pyth SDK integration for price feeds |
| **Multi-DEX Pricing** | `solana-arbitrage` | `arbitrage-bot.ts` - `fetchOrcaPrice()`, `fetchRaydiumPrice()` |
| **Analytics Calculations** | `dverse` | `calculations.ts` - can adapt for volatility metrics |
| **Time-based Settlement** | `continuum` | `repo-engine` - interest calculation, time-based settlement |
| **Oracle Service Pattern** | `titanus` | `oracle-service.ts` - periodic data collection pattern |

### Key Contract: VolatilityVault

```rust
// Pseudocode combining deltavault + continuum patterns

#[account]
pub struct VolatilityVault {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub underlying_mint: Pubkey,        // e.g., SOL

    // Vault mechanics (from deltavault)
    pub total_shares: u64,
    pub total_usdc: u64,

    // Volatility tracking (new)
    pub price_samples: [PriceSample; 8640],  // 30 days × 288 samples/day (5-min)
    pub sample_index: u16,
    pub current_realized_variance: u64,      // Scaled by 1e8
    pub strike_variance: u64,                // Fixed at epoch start

    // Epoch management (inspired by continuum)
    pub epoch_start: i64,
    pub epoch_duration: u64,                 // 30 days = 2,592,000 seconds
    pub settlement_time: Option<i64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PriceSample {
    pub price: u64,       // Price in USDC (6 decimals)
    pub timestamp: i64,
}

impl VolatilityVault {
    /// Calculate realized variance from price samples
    /// Variance = Σ(log(P_i / P_{i-1}))² × (365 / n) × 10000
    pub fn calculate_realized_variance(&self) -> Result<u64> {
        // Implementation using price samples
        // 1. Calculate log returns for each consecutive price pair
        // 2. Square each return
        // 3. Sum and annualize
    }
}
```

### Implementation Roadmap

**Phase 1: Volatility Oracle (Week 1-2)**
- Fork `titanus/oracle` pattern for continuous price sampling
- Integrate `solana-arbitrage` multi-DEX price fetching
- Store TWAP samples on-chain every 5 minutes
- Calculate rolling 30-day realized variance

**Phase 2: Variance Swap Contract (Week 3-4)**
- Fork `deltavault` vault structure
- Add variance swap state (strike, notional, expiry)
- Implement `open_long`, `open_short`, `settle` instructions
- Use `continuum` patterns for time-based settlement

**Phase 3: sVOL Index Token (Week 5-6)**
- Create tokenized volatility exposure
- Implement rebalancing mechanism
- Add liquidity pools for sVOL trading

### Revenue Model

- 0.1% fee on variance swap notional
- 0.3% management fee on sVOL AUM
- Liquidation penalties on under-collateralized positions

---

## 2. FundingSwap — Funding Rate Derivatives

### Market Analysis

**Current State:**
- Funding rates are recurring payments between long/short perpetual positions
- Average funding rate in 2025 hovers around 0.01% every 8 hours
- Funding rate arbitrage is a popular strategy but requires active management
- **No protocol exists to trade funding rates as a standalone derivative**

**Why This Is Underexplored:**
1. Funding rates are exchange-specific (Binance, Bybit, dYdX have different rates)
2. Rates can flip positive/negative rapidly
3. No standardized funding rate index exists
4. Requires oracle infrastructure for cross-exchange rates

### Product Specification

**Core Product: Funding Rate Swap**
- **Payoff**: `Notional × (ActualFundingRate - FixedRate) × Duration`
- **Receiver**: Pays fixed rate, receives floating (actual) funding rate
- **Payer**: Receives fixed rate, pays floating funding rate

**Use Cases:**
1. **Hedging**: Perp traders hedge against funding rate volatility
2. **Yield**: Earn fixed yield by paying floating (when funding is low)
3. **Speculation**: Bet on funding rate direction

### Technical Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FUNDINGSWAP PROTOCOL                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐ │
│   │  Funding Rate    │───▶│ Rate Index       │───▶│ Swap Engine     │ │
│   │  Oracle          │    │ Calculator       │    │                 │ │
│   │                  │    │                  │    │ - Open swap     │ │
│   │ - dYdX rates     │    │ - Weighted avg   │    │ - Settle swap   │ │
│   │ - Jupiter perps  │    │ - TWAP smooth    │    │ - Mark-to-mkt   │ │
│   │ - Drift rates    │    │ - Index publish  │    │ - Liquidation   │ │
│   └──────────────────┘    └──────────────────┘    └─────────────────┘ │
│          │                                                │           │
│          ▼                                                ▼           │
│   ┌──────────────────────────────────────────────────────────────────┐│
│   │                  Collateral & Settlement Layer                   ││
│   │    (From continuum: atomic swaps, interest calc, settlement)     ││
│   └──────────────────────────────────────────────────────────────────┘│
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Cross-Breeding Your Repos

| Component | Source Repo | Files to Reuse |
|-----------|-------------|----------------|
| **Swap Engine** | `continuum` | `repo-engine/lib.rs` - `initiate_repo`, `execute_swap`, `settle_repo` pattern |
| **Interest Calculation** | `continuum` | `repo_transaction.calculate_interest()` - adapt for funding rate accrual |
| **Rate Analytics** | `dverse` | Database schema for tracking funding rate history |
| **AI Signal Detection** | `kalshify` | `smart-money-detector.ts` - adapt for funding rate anomaly detection |
| **Prediction Market** | `kalshify` | Market structure for funding rate direction betting |
| **Oracle Pattern** | `titanus` | `oracle-service.ts` for periodic rate fetching |

### Key Contract: FundingSwap

```rust
// Combines continuum repo-engine pattern with funding rate mechanics

#[account]
pub struct FundingRatePool {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,

    // Pool parameters (from continuum)
    pub min_swap_amount: u64,
    pub max_swap_amount: u64,
    pub max_duration_seconds: u64,
    pub settlement_grace_period: u64,

    // Funding rate specific
    pub current_index_rate: i64,         // Signed! Can be negative
    pub rate_oracle: Pubkey,
    pub rate_update_frequency: u64,      // 8 hours typical

    // Pool state
    pub total_receiver_notional: u64,
    pub total_payer_notional: u64,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
pub struct FundingSwap {
    pub pool: Pubkey,
    pub receiver: Pubkey,                // Pays fixed, receives floating
    pub payer: Pubkey,                   // Receives fixed, pays floating
    pub notional: u64,
    pub fixed_rate_bps: i16,             // Signed! e.g., 10 = 0.10%
    pub start_time: i64,
    pub end_time: i64,
    pub accumulated_pnl: i64,            // Mark-to-market P&L
    pub status: SwapStatus,
    pub nonce: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum SwapStatus {
    Initiated,
    Active,
    Settled,
    Cancelled,
    Defaulted,
}

// Funding rate calculation (every 8 hours)
impl FundingSwap {
    pub fn calculate_period_pnl(&self, actual_rate_bps: i16) -> i64 {
        // P&L = Notional × (ActualRate - FixedRate) / 10000
        let rate_diff = actual_rate_bps as i64 - self.fixed_rate_bps as i64;
        (self.notional as i64 * rate_diff) / 10000
    }
}
```

### Implementation Roadmap

**Phase 1: Funding Rate Oracle (Week 1-2)**
- Build oracle service fetching rates from Drift, Jupiter Perps, dYdX
- Calculate weighted average index rate
- Publish rate on-chain every 8 hours
- Store historical rates for settlement

**Phase 2: Swap Contract (Week 3-4)**
- Fork `continuum/repo-engine` structure
- Adapt for funding rate swap mechanics
- Implement periodic settlement (every funding period)
- Add mark-to-market P&L tracking

**Phase 3: Prediction Layer (Week 5-6)**
- Integrate `kalshify` prediction market for rate direction
- Add AI signal detection for funding anomalies
- Create frontend with `dverse` analytics patterns

### Revenue Model

- 0.05% fee on swap notional at open
- 2% of realized P&L as settlement fee
- Oracle subscription fees for institutions

---

## 3. ExoticVault — Asian & Barrier Options

### Market Analysis

**Current State:**
- Cega is the only DeFi protocol with exotic options (barrier options for downside protection)
- Asian options use average price over time, reducing manipulation risk
- State of DeFi 2025 notes perp DEXs are scaling, but exotic options remain nascent
- Opyn's Squeeth pioneered power perpetuals but no Asian/barrier variants exist

**Why Asian Options Are Perfect for Crypto:**
1. Average price settlement resists flash loan manipulation
2. Lower premium than vanilla options (less gamma)
3. More predictable hedging costs
4. Natural fit for miners/stakers with continuous exposure

### Product Specification

**Product 1: Asian Call Option**
- **Payoff**: `max(0, AveragePrice - Strike)`
- **Settlement**: Uses TWAP over option period (e.g., 30-day average)
- **Use Case**: Miners hedging with lower premium

**Product 2: Knock-Out Barrier Option**
- **Payoff**: Standard call/put, BUT option becomes worthless if barrier is breached
- **Example**: SOL call with $200 strike, $250 knock-out barrier
- **Use Case**: Cheaper directional exposure with defined risk

**Product 3: Knock-In Barrier Option**
- **Payoff**: Option only activates if barrier is touched
- **Example**: SOL put that activates only if price drops below $150
- **Use Case**: Crash protection at very low premium

### Technical Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         EXOTICVAULT PROTOCOL                           │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐ │
│   │  TWAP Oracle     │───▶│ Option Pricer    │───▶│ ExoticVault     │ │
│   │  (Titanus-style) │    │                  │    │                 │ │
│   │                  │    │ - Asian pricing  │    │ - Deposit USDC  │ │
│   │ - 5-min samples  │    │ - Barrier check  │    │ - Buy options   │ │
│   │ - Rolling TWAP   │    │ - Greeks calc    │    │ - Auto-settle   │ │
│   │ - Barrier monitor│    │ - Premium calc   │    │ - Claim payout  │ │
│   └──────────────────┘    └──────────────────┘    └─────────────────┘ │
│          │                        │                       │           │
│          │                        ▼                       │           │
│          │               ┌──────────────────┐             │           │
│          └──────────────▶│ Barrier Monitor  │◀────────────┘           │
│                          │                  │                         │
│                          │ - Continuous     │                         │
│                          │ - Knock-in/out   │                         │
│                          │ - Event trigger  │                         │
│                          └──────────────────┘                         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Cross-Breeding Your Repos

| Component | Source Repo | Files to Reuse |
|-----------|-------------|----------------|
| **Vault + Options** | `deltavault` | Full vault structure, strike/expiry management |
| **TWAP Oracle** | `titanus` | `oracle-service.ts` - continuous price sampling |
| **Barrier Monitoring** | `titanus` | `geofence` logic → adapt for price barriers |
| **Settlement Engine** | `continuum` | Time-based settlement, grace periods |
| **Privacy (Large Trades)** | `veil` | Encrypted orders for institutional exotic trades |
| **Premium Calculation** | `indie-star-market` | AMM pricing can inform option premium curves |

### Key Contract: ExoticOption

```rust
// Combines deltavault options + titanus continuous monitoring

#[account]
pub struct ExoticOption {
    pub vault: Pubkey,
    pub holder: Pubkey,
    pub underlying_mint: Pubkey,

    // Option parameters
    pub option_type: ExoticOptionType,
    pub direction: OptionDirection,       // Call or Put
    pub strike_price: u64,
    pub premium_paid: u64,
    pub notional: u64,

    // Exotic parameters
    pub barrier_price: Option<u64>,       // For barrier options
    pub barrier_type: Option<BarrierType>,// KnockIn or KnockOut
    pub barrier_breached: bool,
    pub barrier_breach_time: Option<i64>,

    // Asian option parameters
    pub price_samples: Vec<u64>,          // For TWAP calculation
    pub sample_count: u16,
    pub average_price: Option<u64>,       // Calculated at settlement

    // Lifecycle
    pub created_at: i64,
    pub expiry: i64,
    pub settled: bool,
    pub payout: Option<u64>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ExoticOptionType {
    Asian,           // Settlement based on average price
    KnockOut,        // Becomes worthless if barrier touched
    KnockIn,         // Only activates if barrier touched
    DoubleBarrier,   // Both upper and lower barriers
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum BarrierType {
    UpAndOut,        // Knock out if price rises above barrier
    DownAndOut,      // Knock out if price falls below barrier
    UpAndIn,         // Knock in if price rises above barrier
    DownAndIn,       // Knock in if price falls below barrier
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum OptionDirection {
    Call,
    Put,
}

impl ExoticOption {
    /// Check if barrier has been breached (from titanus geofence pattern)
    pub fn check_barrier(&mut self, current_price: u64, current_time: i64) -> bool {
        if let Some(barrier) = self.barrier_price {
            let breached = match self.barrier_type {
                Some(BarrierType::UpAndOut) | Some(BarrierType::UpAndIn) => {
                    current_price >= barrier
                }
                Some(BarrierType::DownAndOut) | Some(BarrierType::DownAndIn) => {
                    current_price <= barrier
                }
                None => false,
            };

            if breached && !self.barrier_breached {
                self.barrier_breached = true;
                self.barrier_breach_time = Some(current_time);
            }
            breached
        } else {
            false
        }
    }

    /// Calculate Asian option average (TWAP)
    pub fn calculate_average_price(&self) -> u64 {
        if self.price_samples.is_empty() {
            return 0;
        }
        let sum: u64 = self.price_samples.iter().sum();
        sum / self.price_samples.len() as u64
    }

    /// Calculate payout at settlement
    pub fn calculate_payout(&self) -> u64 {
        // For knock-out: if breached, payout = 0
        if matches!(self.option_type, ExoticOptionType::KnockOut) && self.barrier_breached {
            return 0;
        }

        // For knock-in: if NOT breached, payout = 0
        if matches!(self.option_type, ExoticOptionType::KnockIn) && !self.barrier_breached {
            return 0;
        }

        // Calculate settlement price
        let settlement_price = match self.option_type {
            ExoticOptionType::Asian => self.calculate_average_price(),
            _ => self.price_samples.last().copied().unwrap_or(0),
        };

        // Calculate intrinsic value
        match self.direction {
            OptionDirection::Call => {
                if settlement_price > self.strike_price {
                    (settlement_price - self.strike_price) * self.notional / settlement_price
                } else {
                    0
                }
            }
            OptionDirection::Put => {
                if settlement_price < self.strike_price {
                    (self.strike_price - settlement_price) * self.notional / self.strike_price
                } else {
                    0
                }
            }
        }
    }
}
```

### Implementation Roadmap

**Phase 1: TWAP Oracle (Week 1-2)**
- Fork `titanus/oracle` for continuous price sampling
- Store price samples on-chain (optimize for gas)
- Implement rolling TWAP calculation
- Add barrier monitoring service

**Phase 2: Asian Options (Week 3-4)**
- Fork `deltavault` vault structure
- Add Asian option state and settlement
- Implement premium pricing (can use simple model initially)
- Build buy/exercise/settle instructions

**Phase 3: Barrier Options (Week 5-6)**
- Add barrier monitoring to oracle service
- Implement knock-in/knock-out logic (inspired by titanus geofence)
- Add event triggers for barrier breach
- Build frontend with barrier visualization

**Phase 4: Privacy Layer (Week 7-8)**
- Integrate `veil` encryption for large institutional trades
- Add confidential order submission
- Enable dark pool matching for exotic options

### Revenue Model

- 1% of premium as protocol fee
- 0.5% of settlement payout
- Premium for barrier monitoring service

---

## Comparison Matrix

| Feature | VolSwap | FundingSwap | ExoticVault |
|---------|---------|-------------|-------------|
| **Novelty** | First variance swaps in DeFi | First funding rate derivatives | First Asian options in DeFi |
| **Complexity** | High | Medium | Medium-High |
| **Time to MVP** | 6 weeks | 6 weeks | 8 weeks |
| **Primary Repo** | `deltavault` + `solana-arbitrage` | `continuum` + `kalshify` | `deltavault` + `titanus` |
| **Target Users** | Vol traders, market makers | Perp traders, yield seekers | Miners, institutions |
| **Competition** | None | None | Cega (partial) |
| **Regulatory Risk** | Low | Medium | Low |

---

## Recommended Priority

### 1. FundingSwap (Recommended First)
**Rationale:**
- Fastest path to market
- Clear use case with massive TAM (perp market is $50B+ daily volume)
- Leverages `continuum` repo-engine heavily (95% complete)
- Lower technical complexity than VolSwap

### 2. ExoticVault (Asian Options)
**Rationale:**
- Strong manipulation resistance narrative
- Unique in DeFi (only Cega has barrier options, no Asian options exist)
- Natural fit for miners/validators
- `titanus` oracle pattern provides excellent foundation

### 3. VolSwap
**Rationale:**
- Highest potential impact
- Most complex implementation
- Requires most novel infrastructure (volatility oracle)
- Best saved for after building track record with simpler products

---

## Cross-Breeding Reference Table

### Files to Copy/Adapt

| Source File | Target Protocol | Adaptation Needed |
|-------------|-----------------|-------------------|
| `deltavault/programs/deltavault/src/lib.rs` | All three | Vault deposit/withdraw/shares |
| `continuum/programs/repo-engine/src/lib.rs` | FundingSwap | Swap lifecycle, settlement |
| `titanus/oracle/src/oracle-service.ts` | VolSwap, ExoticVault | Price sampling pattern |
| `solana-arbitrage/src/arbitrage-bot.ts` | VolSwap | Multi-DEX price fetching |
| `dverse/src/lib/analytics/calculations.ts` | All three | Analytics calculations |
| `kalshify/src/lib/intel/smart-money-detector.ts` | FundingSwap | Anomaly detection |
| `veil-solana/packages/crypto/*` | ExoticVault | Privacy layer |
| `titanus/programs/titanus/src/lib.rs` | ExoticVault | Geofence → Barrier logic |

---

## Sources

- [Bitcoin Volatility vs VIX - CoinDesk](https://www.coindesk.com/markets/2025/12/02/bitcoin-volatility-breaks-out-vs-vix-setting-up-possible-pair-trade-opportunity)
- [Variance Swaps - AnalystPrep](https://analystprep.com/study-notes/cfa-level-iii/volatility-derivatives-and-variance-swaps-2/)
- [State of DeFi 2025 - DL News](https://www.dlnews.com/research/internal/state-of-defi-2025/)
- [Funding Rates Guide - Coinbase](https://www.coinbase.com/learn/perpetual-futures/understanding-funding-rates-in-perpetual-futures)
- [Funding Rate Arbitrage - MadeInArk](https://madeinark.org/funding-rate-arbitrage-and-perpetual-futures-the-hidden-yield-strategy-in-cryptocurrency-derivatives-markets/)
- [Power Perpetuals - Paradigm](https://www.paradigm.xyz/2021/08/power-perpetuals)
- [Exotic Options in Crypto - FasterCapital](https://fastercapital.com/content/Exotic-Options--Exotic-Edge--Uncovering-the-Mystery-of-Crypto-Exotic-Options.html)
- [Cega on Arbitrum - The Block](https://www.theblock.co/post/238584/cega-defi-arbitrum)
- [Funding Rates Explained - Cube Exchange](https://www.cube.exchange/what-is/funding-rate)
- [Perpetual Swap Funding - Deribit](https://insights.deribit.com/education/perpetual-swap-funding/)

---

## Next Steps

1. **Choose Protocol** - Select which Tier 1 opportunity to build first
2. **Create Project Scaffold** - Initialize new repo with monorepo structure
3. **Copy Base Code** - Port relevant code from source repos
4. **Build Oracle** - Implement price/rate oracle service
5. **Develop Smart Contracts** - Build core Solana programs
6. **Create Frontend** - Build trading interface
7. **Deploy to Devnet** - Test and iterate
8. **Security Audit** - Professional review before mainnet
9. **Launch** - Deploy to mainnet with initial liquidity

---

*Document generated by Claude Code analysis of `/Users/hiroyusai/src` repositories*
