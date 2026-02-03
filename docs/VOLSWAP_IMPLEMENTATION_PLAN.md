# VolSwap Implementation Plan

## Overview

VolSwap is a variance swap protocol enabling traders to speculate on or hedge against realized volatility. Users can go long (betting volatility will exceed strike) or short (betting volatility stays below strike).

**Payoff Formula**: `Notional × (RealizedVariance - StrikeVariance)`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      VolSwap Protocol                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ VariancePool │    │   Position   │    │    Epoch     │  │
│  │              │◄──►│   Manager    │◄──►│   Handler    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         └───────────────────┼───────────────────┘           │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  Shared Oracle  │                      │
│                    │   (via CPI)     │                      │
│                    └─────────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Development Phases

### Phase 1: Core Infrastructure (Week 1-2)

#### 1.1 Oracle Integration
- [ ] Implement CPI calls to shared-oracle program
- [ ] Create variance calculation from price samples
- [ ] Set up historical price buffer management
- [ ] Implement TWAP and variance aggregation

**Key Files:**
- `programs/volswap/src/utils/oracle.rs` (new)
- `programs/shared-oracle/src/state.rs` (modify variance calc)

#### 1.2 Pool Management
- [ ] Complete `initialize_pool` with proper PDA derivation
- [ ] Implement collateral vault creation (Token-2022)
- [ ] Add pool parameter validation
- [ ] Create pool state serialization tests

**Integration from existing repos:**
- Borrow vault pattern from `deltavault` for collateral management
- Use escrow pattern from `escrow` for settlement guarantees

### Phase 2: Position Management (Week 2-3)

#### 2.1 Opening Positions
- [ ] Implement `open_long` with collateral deposit
- [ ] Implement `open_short` with margin requirements
- [ ] Add position size limits and validation
- [ ] Create position PDA with unique seeds

**Margin Requirements:**
```rust
// Long positions: Full notional at risk
long_margin = notional * max_expected_variance / 10000

// Short positions: Higher margin (unlimited upside risk)
short_margin = notional * (strike_variance + variance_cap) / 10000
```

#### 2.2 Position State
- [ ] Track entry variance strike
- [ ] Store position timestamp for epoch assignment
- [ ] Implement position modification (increase/decrease)
- [ ] Add emergency position closure

### Phase 3: Epoch Settlement (Week 3-4)

#### 3.1 Epoch Lifecycle
- [ ] Implement `settle_epoch` with variance finalization
- [ ] Calculate realized variance from oracle samples
- [ ] Distribute P&L to positions
- [ ] Handle edge cases (no samples, extreme values)

**Variance Calculation:**
```rust
// Annualized variance from log returns
variance = Σ(log(P_i/P_{i-1}))² × (365 × 24 × 3600 / sample_interval)
```

#### 3.2 Payout Distribution
- [ ] Implement `claim_payout` with proper accounting
- [ ] Handle partial claims for large positions
- [ ] Add slippage protection for extreme volatility
- [ ] Create settlement receipts

### Phase 4: Pool Economics (Week 4-5)

#### 4.1 Fee Structure
- [ ] Implement trading fees (entry/exit)
- [ ] Add protocol fees for treasury
- [ ] Create LP rewards distribution
- [ ] Implement fee tier system based on volume

#### 4.2 Liquidity Provisioning
- [ ] Add LP token minting for pool deposits
- [ ] Implement withdrawal with pro-rata share
- [ ] Create LP incentive mechanisms
- [ ] Add time-weighted LP rewards

### Phase 5: Risk Management (Week 5-6)

#### 5.1 Circuit Breakers
- [ ] Implement variance caps (prevent unbounded losses)
- [ ] Add position limits per epoch
- [ ] Create emergency pause functionality
- [ ] Implement gradual deleveraging

#### 5.2 Oracle Safety
- [ ] Add price staleness checks
- [ ] Implement multi-oracle aggregation
- [ ] Create fallback price sources
- [ ] Add manipulation detection

## Integration Points

### From Existing Repos

| Feature | Source Repo | Adaptation |
|---------|-------------|------------|
| Vault management | deltavault | Covered call vault → variance pool |
| Price feeds | continuum | JPY oracle → crypto volatility oracle |
| Settlement logic | escrow | 3-party → bilateral variance settlement |
| Analytics hooks | dverse | Trading metrics → volatility metrics |

### Cross-Protocol Integration

```rust
// Example: Cross-protocol position
pub struct HedgedPosition {
    // Long variance in VolSwap
    pub volswap_position: Pubkey,
    // Short perp in external protocol (funding hedge)
    pub perp_position: Pubkey,
    // Combined risk metrics
    pub net_vega: i64,
    pub net_gamma: i64,
}
```

## Testing Strategy

### Unit Tests
```
tests/
├── volswap/
│   ├── test_initialize_pool.rs
│   ├── test_open_positions.rs
│   ├── test_settle_epoch.rs
│   ├── test_variance_calculation.rs
│   └── test_edge_cases.rs
```

### Integration Tests
- [ ] Full epoch lifecycle (open → sample → settle → claim)
- [ ] Multi-position settlement
- [ ] Oracle failure recovery
- [ ] Concurrent position management

### Fuzz Tests
- [ ] Random price sequences
- [ ] Extreme variance scenarios
- [ ] Position size edge cases

## Deployment Roadmap

### Testnet (Devnet)
1. Deploy shared-oracle
2. Deploy volswap program
3. Initialize test pools (SOL/USDC, ETH/USDC)
4. Run simulated epochs with historical data

### Mainnet Beta
1. Deploy with limited TVL caps
2. Whitelist initial LPs
3. 24-hour epochs initially
4. Gradual TVL increase

### Full Mainnet
1. Remove TVL caps
2. Open LP participation
3. Add more asset pairs
4. Enable cross-protocol composability

## SDK Integration

```typescript
// packages/sdk/src/volswap/index.ts

export class VolSwapClient {
  // Initialize pool
  async initializePool(params: InitPoolParams): Promise<TransactionSignature>;

  // Open long variance position
  async openLong(poolPubkey: PublicKey, notional: BN, strikeVariance: number): Promise<TransactionSignature>;

  // Open short variance position
  async openShort(poolPubkey: PublicKey, notional: BN, strikeVariance: number): Promise<TransactionSignature>;

  // Get current epoch variance
  async getCurrentVariance(poolPubkey: PublicKey): Promise<number>;

  // Calculate position P&L
  async getPositionPnL(positionPubkey: PublicKey): Promise<{
    realizedPnL: BN;
    unrealizedPnL: BN;
    currentVariance: number;
  }>;
}
```

## Risk Considerations

1. **Variance Explosion**: Extreme market events can cause unbounded short losses
   - Mitigation: Variance caps, margin requirements

2. **Oracle Manipulation**: TWAP helps but not immune
   - Mitigation: Multiple oracles, outlier detection

3. **Liquidity Fragmentation**: Epoch-based design may fragment liquidity
   - Mitigation: Rolling epochs, LP incentives

4. **Smart Contract Risk**: Complex settlement logic
   - Mitigation: Formal verification, audits, bug bounty
