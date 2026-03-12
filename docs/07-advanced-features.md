# Advanced Features

Sigma Protocol includes several advanced features that address critical competitive gaps and provide institutional-grade capabilities.

## Sigma Volatility Index (SVI)

The Sigma Volatility Index (SVI) is an on-chain volatility index comparable to Volmex's SVIV, providing real-time volatility tracking for Solana assets.

### What is SVI?

SVI combines realized volatility (calculated from historical price data) with implied volatility (from options markets) to create a comprehensive volatility metric. This index helps traders:

- **Identify volatility regimes**: Know when markets are in low, normal, or extreme volatility states
- **Spot mean reversion opportunities**: SVI signals when volatility is elevated (likely to decrease) or depressed (likely to increase)
- **Make informed trading decisions**: Use volatility data for VolSwap positioning

### Index Components

| Component | Description | Weight |
|-----------|-------------|--------|
| Realized Volatility | Calculated from variance tracker data | Configurable |
| Implied Volatility | From options market data | Configurable |
| Current Value | Composite index (basis points) | - |
| 7-Day Average | Rolling weekly average | - |
| 30-Day Average | Rolling monthly average | - |

### Volatility Regimes

SVI classifies market conditions into five regimes:

| Regime | Volatility Level | Interpretation |
|--------|------------------|----------------|
| **VeryLow** | < 15% annualized | Extremely calm, potential for spike |
| **Low** | 15-25% | Below normal, watch for mean reversion |
| **Normal** | 25-45% | Typical market conditions |
| **High** | 45-70% | Elevated, potential for normalization |
| **Extreme** | > 70% | Crisis levels, high mean reversion signal |

### Mean Reversion Signals

The index provides two key signals:

- **Elevated Signal**: When current volatility is significantly above the 30-day average, indicating potential for vol to decrease
- **Depressed Signal**: When current volatility is significantly below the 30-day average, indicating potential for vol to increase

### Use Cases

1. **Event Trading**: Check SVI before opening VolSwap positions to understand current vol regime
2. **Risk Management**: Monitor SVI to adjust position sizes based on market conditions
3. **Relative Value**: Compare SVI to historical averages for mean reversion trades
4. **Research**: Track volatility trends across different assets

---

## CEX Funding Rate Integration

Sigma aggregates funding rates from major centralized exchanges, dramatically expanding the addressable market for FundingSwap beyond on-chain perps.

### Supported Exchanges

| Exchange | Weight | Status |
|----------|--------|--------|
| Binance | Configurable | Active |
| Bybit | Configurable | Active |
| OKX | Configurable | Active |
| Deribit | Configurable | Active |
| Bitget | Configurable | Active |
| Kraken | Configurable | Active |

### Aggregation Methods

CEX funding rates can be aggregated using different methods:

| Method | Description | Best For |
|--------|-------------|----------|
| **Simple Average** | Equal weight across exchanges | General use |
| **OI-Weighted** | Weighted by open interest | Accurate market representation |
| **Median** | Middle value, ignores outliers | Manipulation resistance |

### How It Works

1. **Data Collection**: Oracle keepers push funding rate data from each exchange
2. **Aggregation**: Rates are combined using the configured method
3. **OI Weighting**: Open interest data provides market-weighted rates
4. **History**: Hourly snapshots are stored for trend analysis

### Data Points

For each exchange source, we track:
- Current funding rate (basis points)
- Open interest (USD)
- Last update timestamp
- Source status (active/inactive)

Aggregated data includes:
- Simple average rate
- OI-weighted rate
- Total open interest across exchanges
- Historical rate snapshots

### Use Cases

1. **CEX Funding Hedging**: Hedge funding costs on Binance/Bybit positions using FundingSwap
2. **Cross-Exchange Arbitrage**: Identify funding rate discrepancies across exchanges
3. **Market Analysis**: Track aggregate funding sentiment across the crypto market
4. **Basis Trading**: Lock in CEX funding yields for predictable returns

### Example: Hedging Binance Funding

```
Position: $100K long BTC perp on Binance
Problem: Funding rate is volatile, swinging between 0.01% and 0.15%

Solution:
1. Open FundingSwap position referencing CEX funding feed
2. Lock in 0.04% fixed rate
3. Swap pays you when Binance funding is high
4. You pay when Binance funding is low
5. Net funding cost: Fixed at 0.04% regardless of market conditions
```

---

## Secondary Market

The Secondary Market enables trading of Sigma positions before expiry through tokenized position tokens, solving the liquidity problem for derivative positions.

### Position Tokenization

Any Sigma position (VolSwap, FundingSwap, ExoticVault) can be tokenized into a tradeable token:

| Field | Description |
|-------|-------------|
| Protocol | Source protocol (VolSwap, FundingSwap, ExoticVault) |
| Original Position | Reference to the source position |
| Notional | Position size |
| Expiry | Settlement timestamp |
| Parameters | Protocol-specific position parameters |
| Mark-to-Market | Current estimated value |

### Marketplace Features

**Listing Positions**
- Set your ask price
- Optional minimum price
- Set listing expiry
- Cancel anytime before sale

**Buying Positions**
- Browse active listings
- Filter by protocol, asset, expiry
- Execute purchase instantly
- Position transfers to buyer

**Price Discovery**
- Mark-to-market valuations
- Historical sale data
- Bid/ask spreads

### Fees

| Action | Fee | Recipient |
|--------|-----|-----------|
| Tokenization | 0.1% | Protocol |
| Listing | Free | - |
| Sale | 0.5% | Protocol + LP pool |
| Cancellation | Free | - |

### Benefits

**For Sellers:**
- Exit positions early without waiting for settlement
- Realize PnL before expiry
- Free up capital for new trades

**For Buyers:**
- Enter positions at discount to notional
- Shorter time to expiry
- Known expiry date

### Example: Selling a VolSwap Position

```
Original Position:
- Long variance swap
- Strike: 35%
- Notional: $10,000
- Expiry: 30 days

After 15 days:
- Realized variance so far: 42%
- Position in profit
- But you need capital for another trade

Solution:
1. Tokenize the position
2. List on Secondary Market
3. Set ask price at $1,500 (15% premium)
4. Buyer purchases
5. You receive $1,500 immediately
6. Buyer takes over position for remaining 15 days
```

### Technical Implementation

1. **Position Token Account**: PDA derived from position ID and protocol
2. **Market Account**: Tracks all listings for a protocol
3. **Listing**: Contains ask price, seller, and expiry
4. **Transfer**: Atomic transfer of position and payment

---

## Switchboard Oracle Integration

Sigma supports Switchboard as an additional oracle source alongside Pyth, providing oracle redundancy and data resilience.

### Why Switchboard?

- **Redundancy**: If Pyth feeds are unavailable, Switchboard provides fallback price data
- **Broader Coverage**: Access to assets not covered by Pyth
- **Decentralized**: Switchboard's oracle network provides independent price validation

### Integration Points

| Protocol | Oracle Usage |
|----------|-------------|
| **VolSwap** | Price feeds for variance calculation and epoch settlement |
| **FundingSwap** | Price feeds for funding rate computation |
| **ExoticVault** | Price feeds for barrier checking, price sampling, and settlement |
| **Shared Oracle** | Aggregates data from both Pyth and Switchboard |

### Price Staleness

All oracle reads include staleness checks to prevent using outdated data:

```rust
require!(
    !price_feed.is_stale(clock.unix_timestamp),
    Error::StalePriceData
);
```

---

## Circuit Breaker

Sigma implements circuit breaker mechanisms to protect against extreme market conditions and oracle failures.

### Automatic Trading Halts

The protocol can automatically halt trading when:

- **Price deviation** exceeds configured thresholds
- **Oracle staleness** indicates feeds are not updating
- **Extreme volatility** triggers regime detection (via SVI)

### Protocol-Level Controls

| Control | Description |
|---------|-------------|
| **Emergency pause** | Admin can pause all protocol operations |
| **Position limits** | Maximum notional per position and per pool |
| **Collateral caps** | Maximum total exposure per vault |
| **Epoch safeguards** | Epoch transitions require valid oracle data |

### Vault Self-Authority Pattern

Token vaults use a self-authority pattern where the vault PDA is its own token authority. This ensures that only the program can authorize token transfers from the vault, preventing unauthorized withdrawals even if other account authorities are compromised.

---

## Integration

All features integrate with Sigma's existing infrastructure:

```
                    ┌─────────────────────┐
                    │   Secondary Market  │
                    │  (Position Trading) │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────┴───────┐     ┌───────┴───────┐     ┌───────┴───────┐
│    VolSwap    │     │  FundingSwap  │     │  ExoticVault  │
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Shared Oracle   │
                    │  (SVI, CEX Feed)  │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
        │   Pyth    │   │Switchboard│   │CEX APIs   │
        └───────────┘   └───────────┘   └───────────┘
```

### Data Flow

1. **Pyth/Switchboard** provide real-time price data
2. **CEX APIs** (via oracles) provide funding rate data
3. **Shared Oracle** aggregates and processes data
4. **SVI** calculates volatility index from variance tracker
5. **Protocols** use oracle data for settlements
6. **Secondary Market** enables position trading

---

## API Reference

### Volatility Index

```rust
// Initialize a new volatility index
initialize_volatility_index(
    asset_symbol: String,      // e.g., "SOL"
    index_name: String,        // e.g., "SVI-SOL-7D"
    duration_days: u8,         // 7 or 30
    implied_weight: u16        // 0-10000 (basis points)
)

// Update index values
update_volatility_index()

// Set implied volatility
set_implied_volatility(
    implied_vol_bps: u64       // Implied vol in basis points
)
```

### CEX Funding Feed

```rust
// Initialize CEX funding feed
initialize_cex_funding_feed(
    market_symbol: String,     // e.g., "BTC-PERP"
    aggregation_method: FundingAggregationMethod
)

// Add exchange source
add_exchange_source(
    exchange: CexExchange,     // Binance, Bybit, etc.
    weight: u16                // Weight for aggregation
)

// Update funding rate
update_exchange_funding(
    exchange: CexExchange,
    rate_bps: i64,             // Funding rate in basis points
    open_interest: u64         // Open interest in USD
)
```

### Secondary Market

```rust
// Initialize market
initialize_secondary_market(
    protocol: SigmaProtocol    // VolSwap, FundingSwap, or ExoticVault
)

// Tokenize position
tokenize_position(
    original_position: Pubkey,
    notional: u64,
    expiry: i64,
    position_data: [u8; 64]
)

// List for sale
list_position(
    ask_price: u64,
    min_price: Option<u64>,
    listing_expiry: Option<i64>
)

// Buy position
buy_position()

// Cancel listing
cancel_listing()
```

---

## Competitive Positioning

These features address the highest-priority competitive gaps identified in our analysis:

| Gap | Solution | Competitor Comparison |
|-----|----------|----------------------|
| Volatility Index | SVI | Comparable to Volmex SVIV |
| CEX Funding Rates | CEX Funding Feed | Comparable to Pendle Boros |
| Position Liquidity | Secondary Market | Comparable to Cega VTM |
| Oracle Redundancy | Pyth + Switchboard | Multi-source resilience |
| Privacy | Private Intents | Encrypted order submission |
| Cross-Chain | Wormhole + CCTP | Ethereum/Arbitrum collateral |

With these features, Sigma offers a complete suite of derivatives infrastructure on Solana.
