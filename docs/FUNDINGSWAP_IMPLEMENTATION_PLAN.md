# FundingSwap Implementation Plan

## Overview

FundingSwap enables trading of funding rate exposure without holding perpetual positions. Traders can receive floating funding rates (paying fixed) or pay floating rates (receiving fixed), enabling pure funding rate speculation and hedging.

**Core Mechanics:**
- **Receiver**: Pays fixed rate, receives floating funding rate
- **Payer**: Receives fixed rate, pays floating funding rate

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FundingSwap Protocol                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ FundingPool  │    │    Swap      │    │   Funding    │  │
│  │   Manager    │◄──►│   Position   │◄──►│   Accrual    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         └───────────────────┼───────────────────┘           │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  Shared Oracle  │                      │
│                    │ (Funding Feed)  │                      │
│                    └─────────────────┘                      │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │ External Perps  │                      │
│                    │ (Drift, Jupiter)│                      │
│                    └─────────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Development Phases

### Phase 1: Funding Rate Oracle (Week 1-2)

#### 1.1 Multi-Source Aggregation
- [ ] Integrate Drift Protocol funding rate feeds
- [ ] Integrate Jupiter Perps funding rate feeds
- [ ] Implement weighted average calculation
- [ ] Add funding rate history buffer

**Data Sources:**
```rust
pub struct FundingRateSource {
    pub protocol: FundingProtocol,  // Drift, Jupiter, etc.
    pub market: Pubkey,             // Specific market
    pub weight: u16,                // Aggregation weight
    pub last_rate: i64,             // Latest funding rate (signed, bps)
    pub last_update: i64,           // Timestamp
}
```

#### 1.2 Oracle Service
- [ ] Create TypeScript oracle service
- [ ] Implement rate fetching from on-chain perp protocols
- [ ] Add rate smoothing and outlier detection
- [ ] Set up cron job for periodic updates

**Oracle Service Location:** `oracle/src/funding/`

```typescript
// oracle/src/funding/fetcher.ts
export class FundingRateFetcher {
  async fetchDriftFundingRate(market: string): Promise<FundingRate>;
  async fetchJupiterFundingRate(market: string): Promise<FundingRate>;
  async aggregateFundingRates(rates: FundingRate[]): Promise<AggregatedRate>;
}
```

### Phase 2: Pool Infrastructure (Week 2-3)

#### 2.1 Pool Creation
- [ ] Implement `initialize_pool` with market parameters
- [ ] Set up collateral vaults for both sides
- [ ] Configure funding period duration (8h standard)
- [ ] Add market-making fixed rate calculation

**Fixed Rate Determination:**
```rust
// Market-implied fixed rate from recent history
pub fn calculate_market_fixed_rate(
    historical_rates: &[i64],
    lookback_periods: u32,
) -> i64 {
    // Weighted average with decay
    // Recent rates weighted more heavily
    let mut weighted_sum = 0i128;
    let mut weight_sum = 0u64;

    for (i, rate) in historical_rates.iter().rev().take(lookback_periods as usize).enumerate() {
        let weight = lookback_periods - i as u32;
        weighted_sum += (*rate as i128) * (weight as i128);
        weight_sum += weight as u64;
    }

    (weighted_sum / weight_sum as i128) as i64
}
```

#### 2.2 Liquidity Management
- [ ] Implement LP deposits and withdrawals
- [ ] Create LP token (fungible representation of pool share)
- [ ] Add utilization-based fee adjustment
- [ ] Implement rebalancing mechanisms

### Phase 3: Swap Positions (Week 3-4)

#### 3.1 Opening Swaps
- [ ] Implement `open_receiver` (pay fixed, receive floating)
- [ ] Implement `open_payer` (receive fixed, pay floating)
- [ ] Add notional validation and limits
- [ ] Calculate initial margin requirements

**Position Economics:**
```
Receiver Position:
  - Deposits: notional * margin_rate
  - Each period: receives (floating_rate - fixed_rate) * notional / 10000
  - Profitable when: floating_rate > fixed_rate

Payer Position:
  - Deposits: notional * margin_rate
  - Each period: receives (fixed_rate - floating_rate) * notional / 10000
  - Profitable when: fixed_rate > floating_rate
```

#### 3.2 Position Management
- [ ] Track accrued funding per position
- [ ] Implement position increase/decrease
- [ ] Add early termination with settlement
- [ ] Create position transfer functionality

### Phase 4: Funding Period Processing (Week 4-5)

#### 4.1 Period Settlement
- [ ] Implement `process_funding_period` instruction
- [ ] Fetch and record current funding rate
- [ ] Calculate net flows for all positions
- [ ] Update position balances atomically

**Settlement Flow:**
```
1. Oracle records current funding rate
2. For each active position:
   a. Calculate period P&L = (floating - fixed) * notional * direction
   b. Update accrued_funding
   c. Check margin adequacy
3. Transfer net flows between pool and positions
4. Increment current_period counter
```

#### 4.2 Automated Processing
- [ ] Create keeper bot for period processing
- [ ] Add incentives for keepers
- [ ] Implement batch processing for efficiency
- [ ] Handle failed period processing

### Phase 5: Risk Management (Week 5-6)

#### 5.1 Margin System
- [ ] Implement initial margin requirements
- [ ] Add maintenance margin checks
- [ ] Create liquidation mechanism
- [ ] Implement partial liquidations

**Margin Calculation:**
```rust
pub fn calculate_required_margin(
    notional: u64,
    periods_remaining: u32,
    rate_volatility: u64,  // Historical funding rate std dev
) -> u64 {
    // Base margin + volatility buffer
    let base_margin = notional / 10;  // 10% base
    let vol_buffer = (notional * rate_volatility * periods_remaining as u64) / 10000;
    base_margin + vol_buffer
}
```

#### 5.2 Pool Risk Controls
- [ ] Add maximum open interest limits
- [ ] Implement utilization caps
- [ ] Create emergency pause functionality
- [ ] Add gradual position wind-down

### Phase 6: Advanced Features (Week 6-7)

#### 6.1 Fixed Rate Curves
- [ ] Implement term structure (different tenors)
- [ ] Add fixed rate discovery mechanism
- [ ] Create rate interpolation for custom durations
- [ ] Implement rate curve arbitrage prevention

#### 6.2 Cross-Protocol Integration
- [ ] Enable hedging with actual perp positions
- [ ] Create funding rate arbitrage tools
- [ ] Integrate with VolSwap for combined strategies
- [ ] Add structured product capabilities

## Integration Points

### From Existing Repos

| Feature | Source Repo | Adaptation |
|---------|-------------|------------|
| Interest accrual | lending | Lending rates → funding rates |
| Market matching | kalshify | Order matching → swap matching |
| Rate feeds | continuum | JPY rates → funding rates |
| Settlement | escrow | Escrow release → funding settlement |

### External Protocol Integration

```rust
// CPI to Drift for funding rate
pub fn fetch_drift_funding_rate(
    drift_program: &AccountInfo,
    perp_market: &AccountInfo,
) -> Result<i64> {
    // Read funding rate from Drift's perp market account
    let market_data = PerpMarket::try_deserialize(&mut &perp_market.data.borrow()[..])?;
    Ok(market_data.amm.last_funding_rate)
}
```

## Testing Strategy

### Unit Tests
```
tests/
├── funding-swap/
│   ├── test_initialize_pool.rs
│   ├── test_open_positions.rs
│   ├── test_process_funding.rs
│   ├── test_margin_calculation.rs
│   ├── test_liquidation.rs
│   └── test_settlement.rs
```

### Integration Tests
- [ ] Full swap lifecycle (open → accrue → settle → claim)
- [ ] Multi-period funding accrual
- [ ] Liquidation scenarios
- [ ] Pool rebalancing

### Simulation Tests
- [ ] Historical funding rate backtesting
- [ ] Stress testing with extreme rates
- [ ] Pool solvency under various scenarios

## Deployment Roadmap

### Testnet (Devnet)
1. Deploy shared-oracle with funding feed
2. Deploy funding-swap program
3. Initialize pools for major markets (SOL-PERP, ETH-PERP)
4. Run simulated funding periods

### Mainnet Beta
1. Deploy with conservative parameters
2. Single market initially (SOL-PERP)
3. Limited notional caps
4. Manual period processing initially

### Full Mainnet
1. Automated keeper network
2. Multiple markets
3. Increased limits
4. Cross-protocol composability

## SDK Integration

```typescript
// packages/sdk/src/funding-swap/index.ts

export class FundingSwapClient {
  // Initialize pool for a market
  async initializePool(params: InitPoolParams): Promise<TransactionSignature>;

  // Open receiver position (pay fixed, receive floating)
  async openReceiver(
    poolPubkey: PublicKey,
    notional: BN,
    duration: number
  ): Promise<TransactionSignature>;

  // Open payer position (receive fixed, pay floating)
  async openPayer(
    poolPubkey: PublicKey,
    notional: BN,
    duration: number
  ): Promise<TransactionSignature>;

  // Get current funding rate
  async getCurrentFundingRate(poolPubkey: PublicKey): Promise<{
    floating: number;
    fixed: number;
    spread: number;
  }>;

  // Calculate position P&L
  async getPositionPnL(positionPubkey: PublicKey): Promise<{
    accruedFunding: BN;
    unrealizedPnL: BN;
    periodsRemaining: number;
  }>;

  // Get historical funding rates
  async getFundingHistory(
    poolPubkey: PublicKey,
    periods: number
  ): Promise<FundingRate[]>;
}
```

## Risk Considerations

1. **Funding Rate Volatility**: Extreme funding can cause large swings
   - Mitigation: Rate caps, margin buffers

2. **Oracle Dependency**: Reliance on perp protocol data
   - Mitigation: Multi-source aggregation, staleness checks

3. **Counterparty Imbalance**: Unequal receiver/payer demand
   - Mitigation: Dynamic fixed rate adjustment, LP backstop

4. **Liquidity Risk**: Positions may be hard to exit
   - Mitigation: Secondary market for positions, early exit penalty

## Economic Model

### Fee Structure
- Entry fee: 0.1% of notional
- Period processing fee: 0.01% of notional (to keepers)
- Early exit fee: 0.5% of notional
- Protocol fee: 10% of trading fees → treasury

### LP Economics
- LPs provide liquidity for imbalanced flows
- Earn spread between receiver/payer fixed rates
- Share in trading fees
- Risk: directional exposure when imbalanced
