# ExoticVault Implementation Plan

## Overview

ExoticVault provides structured exotic options including Asian options (TWAP-settled) and barrier options (knock-in/knock-out). These options offer manipulation resistance (Asian) and conditional payouts (barrier), enabling sophisticated hedging and speculation strategies.

**Option Types:**
- **Asian Call/Put**: Settlement based on TWAP, not spot price
- **Knock-Out (Up/Down)**: Becomes worthless if barrier is breached
- **Knock-In (Up/Down)**: Only becomes active if barrier is breached

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ExoticVault Protocol                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ ExoticVault  │    │   Option     │    │   Sample     │  │
│  │   Manager    │◄──►│   Position   │◄──►│   Buffer     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         │            ┌──────┴──────┐            │           │
│         │            │             │            │           │
│  ┌──────▼──────┐  ┌──▼───┐   ┌────▼───┐  ┌────▼─────┐    │
│  │   Asian     │  │Knock │   │ Knock  │  │  TWAP    │    │
│  │  Options    │  │ Out  │   │  In    │  │  Calc    │    │
│  └─────────────┘  └──────┘   └────────┘  └──────────┘    │
│                                                              │
│                    ┌─────────────────┐                      │
│                    │  Shared Oracle  │                      │
│                    │  (Price Feed)   │                      │
│                    └─────────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Development Phases

### Phase 1: Vault Infrastructure (Week 1-2)

#### 1.1 Vault Setup
- [ ] Complete `initialize_vault` with parameters
- [ ] Set up collateral vault (Token-2022)
- [ ] Configure option parameters (expiry ranges, strike ranges)
- [ ] Add vault admin controls

**Vault Configuration:**
```rust
pub struct VaultConfig {
    pub min_expiry_seconds: i64,      // Minimum option duration
    pub max_expiry_seconds: i64,      // Maximum option duration
    pub min_strike_percent: u16,      // Min strike as % of spot (e.g., 50%)
    pub max_strike_percent: u16,      // Max strike as % of spot (e.g., 200%)
    pub sample_interval_seconds: u32, // TWAP sample frequency
    pub max_options_per_user: u8,     // Position limits
}
```

#### 1.2 Collateral Management
- [ ] Implement premium collection
- [ ] Create collateral reservation for payouts
- [ ] Add LP deposits for underwriting
- [ ] Implement withdrawal with utilization checks

**Integration from deltavault:**
- Borrow vault management patterns
- Adapt covered call collateral logic for exotic options

### Phase 2: Asian Options (Week 2-3)

#### 2.1 Price Sampling
- [ ] Complete `record_price_sample` instruction
- [ ] Implement sample buffer management
- [ ] Create TWAP calculation with time weighting
- [ ] Add sample validation (staleness, outliers)

**TWAP Calculation:**
```rust
pub fn calculate_twap(&self) -> u64 {
    if self.samples.len() < 2 {
        return self.samples.first().map(|s| s.price).unwrap_or(0);
    }

    let mut time_weighted_sum: u128 = 0;
    let mut total_time: i64 = 0;

    for i in 1..self.samples.len() {
        let prev = &self.samples[i - 1];
        let curr = &self.samples[i];
        let duration = curr.timestamp - prev.timestamp;

        // Use average of the two prices for the period
        let avg_price = (prev.price as u128 + curr.price as u128) / 2;
        time_weighted_sum += avg_price * duration as u128;
        total_time += duration;
    }

    if total_time == 0 {
        return self.samples.last().map(|s| s.price).unwrap_or(0);
    }

    (time_weighted_sum / total_time as u128) as u64
}
```

#### 2.2 Asian Option Trading
- [ ] Complete `buy_asian_call` instruction
- [ ] Complete `buy_asian_put` instruction
- [ ] Implement premium calculation (Black-Scholes adapted)
- [ ] Create option position account

**Premium Pricing (Simplified):**
```rust
// Asian options have lower premium due to volatility smoothing
// Typically 60-80% of equivalent vanilla option
pub fn calculate_asian_premium(
    spot_price: u64,
    strike_price: u64,
    time_to_expiry: i64,
    volatility: u64,
    is_call: bool,
) -> u64 {
    let vanilla_premium = black_scholes_premium(
        spot_price, strike_price, time_to_expiry, volatility, is_call
    );
    // Asian discount factor (empirical: sqrt(1/3) ≈ 0.577)
    vanilla_premium * 58 / 100
}
```

### Phase 3: Barrier Options (Week 3-4)

#### 3.1 Barrier Monitoring
- [ ] Complete `check_barrier` instruction
- [ ] Implement barrier breach detection
- [ ] Add breach timestamp and price recording
- [ ] Create keeper incentives for monitoring

**Barrier Types:**
```rust
pub enum BarrierDirection {
    Up,    // Barrier above current price
    Down,  // Barrier below current price
}

pub enum BarrierType {
    KnockOut, // Option dies if barrier touched
    KnockIn,  // Option activates if barrier touched
}

// Combined barrier options:
// Up-and-Out Call: Call that dies if price goes too high
// Down-and-Out Put: Put that dies if price goes too low
// Up-and-In Call: Call that only exists if price goes high first
// Down-and-In Put: Put that only exists if price goes low first
```

#### 3.2 Barrier Option Trading
- [ ] Complete `buy_knockout` instruction
- [ ] Complete `buy_knockin` instruction
- [ ] Implement rebate logic for knock-outs
- [ ] Add barrier validation (must be OTM)

**Premium Discount:**
```rust
// Barrier options are cheaper than vanilla
// Knock-out discount depends on barrier distance
pub fn calculate_barrier_discount(
    spot_price: u64,
    barrier_price: u64,
    volatility: u64,
    time_to_expiry: i64,
) -> u64 {
    // Probability of touching barrier (simplified)
    let distance_percent = if barrier_price > spot_price {
        (barrier_price - spot_price) * 10000 / spot_price
    } else {
        (spot_price - barrier_price) * 10000 / spot_price
    };

    // Higher distance = lower touch probability = smaller discount
    // Returns discount as percentage (0-100)
    let touch_probability = estimate_touch_probability(
        distance_percent, volatility, time_to_expiry
    );

    100 - touch_probability
}
```

### Phase 4: Settlement (Week 4-5)

#### 4.1 Option Settlement
- [ ] Complete `settle_option` instruction
- [ ] Handle Asian settlement (use TWAP)
- [ ] Handle barrier settlement (check breach status)
- [ ] Calculate final payouts

**Settlement Logic:**
```rust
pub fn settle_option(option: &mut ExoticOption, settlement_price: u64) -> Result<()> {
    match option.option_type {
        // Asian options use TWAP
        OptionType::AsianCall | OptionType::AsianPut => {
            // settlement_price should be TWAP from sample buffer
            let intrinsic = option.calculate_intrinsic_value(settlement_price);
            option.payout_amount = intrinsic;
        }

        // Knock-out options
        OptionType::UpAndOutCall | OptionType::DownAndOutCall |
        OptionType::UpAndOutPut | OptionType::DownAndOutPut => {
            if option.barrier_breached {
                // Knocked out - return rebate if any
                option.payout_amount = option.rebate_amount;
            } else {
                // Not knocked out - behaves like vanilla
                option.payout_amount = option.calculate_intrinsic_value(settlement_price);
            }
        }

        // Knock-in options
        OptionType::UpAndInCall | OptionType::DownAndInCall |
        OptionType::UpAndInPut | OptionType::DownAndInPut => {
            if option.barrier_breached {
                // Knocked in - behaves like vanilla
                option.payout_amount = option.calculate_intrinsic_value(settlement_price);
            } else {
                // Never knocked in - expires worthless
                option.payout_amount = 0;
            }
        }
    }

    option.status = OptionStatus::Settled;
    Ok(())
}
```

#### 4.2 Payout Claims
- [ ] Complete `claim_payout` instruction
- [ ] Transfer collateral to option holder
- [ ] Update vault accounting
- [ ] Close option account and return rent

### Phase 5: Risk Management (Week 5-6)

#### 5.1 Vault Exposure Management
- [ ] Track total delta exposure
- [ ] Implement position limits by strike/expiry
- [ ] Add collateral utilization caps
- [ ] Create exposure hedging hooks

**Risk Metrics:**
```rust
pub struct VaultRiskMetrics {
    pub total_collateral: u64,
    pub utilized_collateral: u64,
    pub max_payout_liability: u64,
    pub delta_exposure: i64,      // Net directional exposure
    pub gamma_exposure: i64,      // Convexity exposure
    pub options_count: u32,
    pub utilization_rate: u16,    // basis points
}
```

#### 5.2 Oracle Safety
- [ ] Implement price manipulation detection
- [ ] Add TWAP deviation alerts
- [ ] Create circuit breakers for extreme moves
- [ ] Add multi-oracle validation

### Phase 6: Advanced Features (Week 6-7)

#### 6.1 Compound Options
- [ ] Asian barrier options (TWAP + barrier)
- [ ] Double barrier options (both up and down)
- [ ] Lookback features (max/min during period)
- [ ] Cliquet options (periodic resets)

#### 6.2 Market Making
- [ ] Implement automated market maker for options
- [ ] Create dynamic pricing based on utilization
- [ ] Add spread adjustment for risk
- [ ] Implement LP rewards

## Integration Points

### From Existing Repos

| Feature | Source Repo | Adaptation |
|---------|-------------|------------|
| Option vault | deltavault | Covered calls → exotic options |
| Price sampling | continuum | Rate sampling → price TWAP |
| Settlement | escrow | Escrow → option settlement |
| Event triggers | kalshify | Market resolution → barrier triggers |
| Analytics | dverse | Trade analytics → options analytics |

### Cross-Protocol Strategies

```rust
// Example: Volatility + Options hedge
pub struct VolOptionsCombo {
    // Long variance in VolSwap
    pub variance_position: Pubkey,
    // Short straddle in ExoticVault
    pub call_option: Pubkey,
    pub put_option: Pubkey,
    // Net exposure
    pub net_vega: i64,
}
```

## Testing Strategy

### Unit Tests
```
tests/
├── exotic-vault/
│   ├── test_initialize_vault.rs
│   ├── test_asian_options.rs
│   ├── test_barrier_options.rs
│   ├── test_twap_calculation.rs
│   ├── test_barrier_detection.rs
│   ├── test_settlement.rs
│   └── test_payout_calculation.rs
```

### Integration Tests
- [ ] Full Asian option lifecycle
- [ ] Barrier breach scenarios
- [ ] Settlement with various price paths
- [ ] Multi-option vault stress test

### Simulation Tests
- [ ] Monte Carlo price path simulation
- [ ] Historical backtesting with real price data
- [ ] Extreme volatility scenarios
- [ ] TWAP manipulation resistance testing

## Deployment Roadmap

### Testnet (Devnet)
1. Deploy shared-oracle with price feed
2. Deploy exotic-vault program
3. Initialize test vaults (SOL/USDC, ETH/USDC)
4. Run simulated options with historical prices

### Mainnet Beta
1. Deploy with conservative parameters
2. Asian options only initially
3. Limited strike ranges and expiries
4. Manual settlement initially

### Full Mainnet
1. Add barrier options
2. Automated keeper network
3. Expanded parameters
4. Cross-protocol composability

## SDK Integration

```typescript
// packages/sdk/src/exotic-vault/index.ts

export class ExoticVaultClient {
  // Initialize vault
  async initializeVault(params: InitVaultParams): Promise<TransactionSignature>;

  // Buy Asian call option
  async buyAsianCall(
    vaultPubkey: PublicKey,
    strikePrice: BN,
    expiry: number,
    notional: BN
  ): Promise<{ signature: TransactionSignature; optionPubkey: PublicKey }>;

  // Buy Asian put option
  async buyAsianPut(
    vaultPubkey: PublicKey,
    strikePrice: BN,
    expiry: number,
    notional: BN
  ): Promise<{ signature: TransactionSignature; optionPubkey: PublicKey }>;

  // Buy barrier option
  async buyBarrierOption(
    vaultPubkey: PublicKey,
    optionType: BarrierOptionType,
    strikePrice: BN,
    barrierPrice: BN,
    expiry: number,
    notional: BN
  ): Promise<{ signature: TransactionSignature; optionPubkey: PublicKey }>;

  // Get current TWAP for option
  async getCurrentTWAP(optionPubkey: PublicKey): Promise<BN>;

  // Check barrier status
  async checkBarrierStatus(optionPubkey: PublicKey): Promise<{
    breached: boolean;
    breachTime?: number;
    breachPrice?: BN;
  }>;

  // Calculate option value
  async getOptionValue(optionPubkey: PublicKey): Promise<{
    intrinsicValue: BN;
    timeValue: BN;
    totalValue: BN;
  }>;
}
```

## Risk Considerations

1. **TWAP Manipulation**: Even TWAP can be manipulated with sustained pressure
   - Mitigation: Long sampling periods, multi-source oracles

2. **Barrier Gaming**: Traders may try to trigger/avoid barriers
   - Mitigation: Use TWAP for barrier checks, not spot

3. **Pricing Complexity**: Exotic options are hard to price accurately
   - Mitigation: Conservative pricing, wide spreads

4. **Liquidity Risk**: Exotic options may have limited secondary market
   - Mitigation: Focus on short-dated options, AMM for basic exotics

5. **Smart Contract Complexity**: More code = more attack surface
   - Mitigation: Extensive testing, formal verification, audits

## Economic Model

### Fee Structure
- Option premium: Market-based (dynamic pricing)
- Protocol fee: 2% of premium → treasury
- Settlement fee: 0.1% of payout → keepers
- Early exercise: Not supported (European-style only)

### LP Economics
- LPs underwrite options by providing collateral
- Earn premiums from option sales
- Bear risk of option payouts
- Can hedge exposure externally

### Keeper Economics
- Price samplers: Small fee per sample
- Barrier checkers: Bounty for detecting breaches
- Settlers: Fee for processing settlements
