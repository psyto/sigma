# Sigma (σ)

**Advanced DeFi Derivatives Protocol Suite on Solana**

Sigma brings institutional-grade volatility and exotic derivative instruments to Solana, enabling advanced hedging, speculation, and structured product creation — at 60% lower cost than traditional alternatives.

## Key Features

| Feature | Description |
|---------|-------------|
| **Volatility Index (SVI)** | On-chain volatility index comparable to Volmex SVIV |
| **CEX Funding Rates** | Aggregated funding rates from Binance, Bybit, OKX, and more |
| **Secondary Market** | Trade positions before expiry via tokenized position market |
| **Unified Oracle** | Shared infrastructure for price, variance, and funding data |
| **Private Intents** | Encrypted order submission with cross-chain collateral support |

## Protocols

| Protocol | Description | Status |
|----------|-------------|--------|
| **VolSwap** | Variance swaps for volatility trading | ✅ Implemented |
| **FundingSwap** | Funding rate receiver/payer derivatives | ✅ Implemented |
| **ExoticVault** | Asian & barrier options | ✅ Implemented |
| **Shared Oracle** | Unified price feeds, TWAP, variance, volatility index | ✅ Implemented |
| **Private Intents** | Encrypted order submission with solver execution | ✅ Implemented |

## Architecture

```
                              Sigma Protocol Suite
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Private Intents Layer                        │ │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │ │
│  │  │   Encrypted  │───▶│    Solver    │───▶│  Cross-Chain Bridge  │  │ │
│  │  │    Orders    │    │   Service    │    │  (Wormhole + CCTP)   │  │ │
│  │  └──────────────┘    └──────────────┘    └──────────────────────┘  │ │
│  └────────────────────────────────┬───────────────────────────────────┘ │
│                                   │                                      │
│  ┌───────────┐   ┌─────────────┐  │  ┌─────────────┐                    │
│  │  VolSwap  │   │ FundingSwap │  │  │ ExoticVault │                    │
│  │           │   │             │  │  │             │                    │
│  │ Variance  │   │  Receiver/  │◀─┴─▶│   Asian &   │                    │
│  │  Swaps    │   │   Payer     │     │   Barrier   │                    │
│  └─────┬─────┘   └──────┬──────┘     └──────┬──────┘                    │
│        │                │                   │                            │
│        └────────────────┼───────────────────┘                            │
│                         │                                                │
│         ┌───────────────┼───────────────┐                               │
│         │               │               │                               │
│  ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐                       │
│  │ Volatility  │ │ CEX Funding │ │  Secondary  │                       │
│  │ Index (SVI) │ │    Feed     │ │   Market    │                       │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                       │
│         │               │               │                               │
│         └───────────────┼───────────────┘                               │
│                         │                                                │
│                ┌────────▼────────┐                                       │
│                │  Shared Oracle  │                                       │
│                │  (Price, TWAP,  │                                       │
│                │   Variance)     │                                       │
│                └────────┬────────┘                                       │
│                         │                                                │
│         ┌───────────────┼───────────────┐                               │
│         │               │               │                               │
│      ┌──▼──┐       ┌────▼────┐     ┌────▼────┐                         │
│      │Pyth │       │Switchboard│   │  Drift  │                         │
│      └─────┘       └──────────┘     └─────────┘                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Protocols Overview

### VolSwap

Trade realized volatility through variance swaps — the purest, most capital-efficient way to trade volatility.

- **Long Variance**: Profit when realized variance exceeds strike (2-4% cost vs 8-12% for straddles)
- **Short Variance**: Profit when realized variance stays below strike
- **Payoff**: `Notional × (RealizedVariance - StrikeVariance) / StrikeVariance`

### FundingSwap

Trade funding rate exposure with support for both on-chain perps and CEX funding rates.

- **Receive Fixed**: Pay floating funding rate, receive fixed rate
- **Pay Fixed**: Receive floating funding rate, pay fixed rate
- **CEX Integration**: Aggregated rates from Binance, Bybit, OKX, Deribit, Bitget, Kraken
- **Use Cases**: Funding rate speculation, basis trading, hedging perp positions

### ExoticVault

Structured exotic options with path-dependent payoffs — 40-60% cheaper than vanilla options.

- **Asian Options**: Settlement based on TWAP (manipulation resistant)
- **Barrier Options**: Knock-in/knock-out at price barriers
- **Use Cases**: Cheap crash protection, hedging, structured products

### Sigma Volatility Index (SVI)

On-chain volatility index comparable to Volmex SVIV.

- **Real-time Index**: Tracks realized and implied volatility
- **Regime Detection**: VeryLow, Low, Normal, High, Extreme classifications
- **Mean Reversion Signals**: Identifies when volatility is elevated or depressed
- **Historical Data**: 7-day and 30-day averages, percentile rankings

### Secondary Market

Trade positions before expiry through tokenized position market.

- **Position Tokenization**: Convert any Sigma position to a tradeable token
- **Marketplace**: List, buy, and sell positions with price discovery
- **Mark-to-Market**: Real-time position valuation
- **Early Exit**: Exit positions without waiting for settlement

### Private Intents

Submit encrypted derivative orders with privacy-preserving execution.

- **Encrypted Orders**: NaCl box encryption (X25519-XSalsa20-Poly1305) via `@veil/crypto`
- **Solver Execution**: Trusted solver decrypts and executes orders via CPI
- **Cross-Chain Collateral**: Bridge collateral from Ethereum/Arbitrum via Wormhole
- **Native USDC**: Circle CCTP support for native USDC bridging
- **Intent Types**: Supports VolSwap, FundingSwap, and ExoticVault orders

## Project Structure

```
sigma/
├── programs/
│   ├── shared-oracle/     # Unified oracle infrastructure
│   │   ├── Price feeds, TWAP, variance tracking
│   │   ├── Volatility Index (SVI)
│   │   ├── CEX Funding Rate aggregation
│   │   └── Secondary Market infrastructure
│   ├── volswap/           # Variance swap protocol
│   ├── funding-swap/      # Funding rate derivatives
│   ├── exotic-vault/      # Asian & barrier options
│   └── private-intents/   # Encrypted order submission
├── packages/
│   └── private-intents/   # Private intents TypeScript library
│       ├── Encryption utilities (NaCl box via @veil/crypto)
│       ├── Intent schemas (variance, funding, exotic)
│       ├── Cross-chain bridge clients
│       └── PrivateIntentClient
├── solver/                # Solver service for intent execution
│   ├── API endpoints
│   ├── Intent polling and decryption
│   └── CPI executors for each protocol
├── sdk/                   # TypeScript SDK (@sigma-protocol/sdk)
├── tests/                 # Integration tests
├── frontend/              # Next.js trading dashboard
├── landing/               # Landing page
├── pitch-deck/            # Investor pitch deck
└── docs/                  # Documentation
    ├── Protocol mechanics
    ├── Use cases
    ├── Marketing plan
    ├── Liquidity strategy
    └── Competitive analysis
```

## Program IDs

| Program | Address |
|---------|---------|
| Shared Oracle | `81SjyEmtwJUeqU9ZEfc7sm9evVpDuGwRSLrFQeCF4j5o` |
| VolSwap | `FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS` |
| FundingSwap | `GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx` |
| ExoticVault | `6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P` |
| Private Intents | `AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow` |

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (1.70+)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (1.18+)
- [Anchor](https://www.anchor-lang.com/docs/installation) (0.30+)
- [Node.js](https://nodejs.org/) (18+)

### Installation

```bash
# Clone the repository
git clone https://github.com/psyto/sigma.git
cd sigma

# Install dependencies
yarn install

# Build programs
anchor build

# Build SDK
cd sdk && yarn build && cd ..

# Build private-intents package
cd packages/private-intents && yarn build && cd ../..

# Install frontend dependencies
cd frontend && yarn install && cd ..
```

### Local Development

```bash
# Configure Solana CLI for localnet
solana config set --url localhost

# Start local validator (in a separate terminal)
solana-test-validator

# Deploy all programs to localnet
anchor deploy

# Run integration tests
anchor test

# Start frontend (connects to localnet by default)
cd frontend && yarn dev

# Start solver service (optional, for private intents)
cd solver && yarn dev
```

The frontend will be available at `http://localhost:3000` and will automatically connect to the local validator.

The solver service runs on `http://localhost:3001` and provides endpoints for encryption key registration and intent monitoring.

### SDK Usage

```bash
# Install the SDK in your project
npm install @sigma-protocol/sdk

# Or link locally for development
cd sdk && npm link
cd ../your-project && npm link @sigma-protocol/sdk
```

See [sdk/README.md](sdk/README.md) for detailed SDK documentation.

## Documentation

### Protocol Mechanics
- [Overview](docs/01-overview.md) - What Sigma is and why it matters
- [VolSwap](docs/02-volswap.md) - Variance swaps explained
- [FundingSwap](docs/03-funding-swap.md) - Funding rate derivatives
- [ExoticVault](docs/04-exotic-vault.md) - Asian & barrier options
- [Liquidity Provision](docs/05-liquidity.md) - LP economics
- [Use Cases](docs/06-use-cases.md) - Real-world trading scenarios
- [Advanced Features](docs/07-advanced-features.md) - SVI, CEX Funding, Secondary Market
- [Private Intents](docs/08-private-intents.md) - Encrypted orders and cross-chain collateral

### Strategy & Business
- [Marketing Plan](docs/marketing-plan.md) - Go-to-market strategy
- [Liquidity Strategy](docs/liquidity-strategy.md) - LP bootstrapping
- [Competitive Analysis](docs/competitive-analysis.md) - Market positioning

## Use Cases

### Volatility Trading
```
ETF decision coming, expect high volatility:
├── Open long variance position in VolSwap
├── Strike: 35%, Cost: 3% premium
└── If realized variance = 55%, profit = 57% on notional
```

### Funding Rate Hedging
```
Holding $100K long perp, funding is unpredictable:
├── Open FundingSwap to receive fixed rate
├── Lock in 0.04% per 8h funding cost
└── Predictable costs regardless of market conditions
```

### Cheap Crash Protection
```
Want downside protection without expensive puts:
├── Buy knock-in put (1.8% vs 5.5% vanilla)
├── Only activates on significant crash (>15% drop)
└── Same protection, 67% savings on premium
```

### Position Trading
```
Need to exit position before expiry:
├── Tokenize position via Secondary Market
├── List at desired price
└── Buyer takes over position, you exit early
```

### Private Order Execution
```
Large variance swap order, want to avoid front-running:
├── Encrypt order parameters with solver's public key
├── Submit encrypted intent with collateral
├── Solver decrypts and executes via CPI
└── Order executed privately, no MEV extraction
```

## Comparison to Alternatives

| Capability | Traditional | Sigma |
|------------|-------------|-------|
| Volatility Trading | Straddles (8-12%) | Variance Swaps (2-4%) |
| Funding Hedge | Not available | FundingSwap |
| Crash Protection | Puts (5-6%) | Barrier Puts (1.5-2%) |
| Position Liquidity | Wait for expiry | Secondary Market |
| Volatility Index | Volmex (EVM only) | SVI (Solana native) |
| CEX Funding Data | Manual tracking | Aggregated feed |

## Roadmap

- [x] Monorepo setup
- [x] Program scaffolding
- [x] Shared Oracle implementation
- [x] VolSwap implementation
- [x] FundingSwap implementation
- [x] ExoticVault implementation
- [x] Volatility Index (SVI)
- [x] CEX Funding Rate integration
- [x] Secondary Market infrastructure
- [x] Private Intents protocol
- [x] Cross-chain collateral (Wormhole + CCTP)
- [x] Solver service
- [x] Frontend dashboard
- [x] Landing page
- [x] Documentation
- [x] TypeScript SDK
- [x] Integration tests
- [x] Localnet deployment
- [ ] Security audit
- [ ] Devnet deployment
- [ ] Mainnet beta

## Target Users

| User Type | Primary Use |
|-----------|-------------|
| Event Traders | VolSwap for volatility around news events |
| Basis Traders | FundingSwap to lock in funding yield |
| Portfolio Hedgers | ExoticVault for cheap crash protection |
| Yield Farmers | LP pools for 15-40% APY |
| Perp Traders | FundingSwap to hedge funding costs |
| Market Makers | VolSwap to hedge gamma exposure |

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a PR.

## Security

This software is in active development and has not been audited. Use at your own risk.

If you discover a security vulnerability, please report it privately.

## License

[MIT](LICENSE)

## Links

- [GitHub](https://github.com/psyto/sigma)
- [Documentation](docs/)
- [Landing Page](landing/)
- [Pitch Deck](pitch-deck/)
