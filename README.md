# Sigma (σ)

**DeFi Derivatives Protocol Suite on Solana**

Sigma brings sophisticated volatility and exotic derivative instruments to Solana, enabling advanced hedging, speculation, and structured product creation.

## Protocols

| Protocol | Description | Status |
|----------|-------------|--------|
| **VolSwap** | Variance swaps for volatility trading | In Development |
| **FundingSwap** | Funding rate receiver/payer derivatives | In Development |
| **ExoticVault** | Asian & barrier options | In Development |
| **Shared Oracle** | Unified price feeds, TWAP, variance | In Development |

## Architecture

```
                         Sigma Protocol Suite
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌───────────┐   ┌─────────────┐   ┌─────────────┐        │
│  │  VolSwap  │   │ FundingSwap │   │ ExoticVault │        │
│  │           │   │             │   │             │        │
│  │ Variance  │   │  Receiver/  │   │   Asian &   │        │
│  │  Swaps    │   │   Payer     │   │   Barrier   │        │
│  └─────┬─────┘   └──────┬──────┘   └──────┬──────┘        │
│        │                │                 │                │
│        └────────────────┼─────────────────┘                │
│                         │                                  │
│                ┌────────▼────────┐                         │
│                │  Shared Oracle  │                         │
│                └─────────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Protocols Overview

### VolSwap

Trade realized volatility through variance swaps.

- **Long**: Profit when realized variance exceeds strike
- **Short**: Profit when realized variance stays below strike
- **Payoff**: `Notional × (RealizedVariance - StrikeVariance)`

### FundingSwap

Trade funding rate exposure without holding perpetuals.

- **Receiver**: Pay fixed rate, receive floating funding rate
- **Payer**: Receive fixed rate, pay floating funding rate
- **Use Cases**: Funding rate speculation, basis trading, hedging

### ExoticVault

Structured exotic options with path-dependent payoffs.

- **Asian Options**: Settlement based on TWAP (manipulation resistant)
- **Barrier Options**: Knock-in/knock-out at price barriers
- **Use Cases**: Hedging, structured products, premium collection

## Project Structure

```
sigma/
├── programs/
│   ├── shared-oracle/     # Unified oracle infrastructure
│   ├── volswap/           # Variance swap protocol
│   ├── funding-swap/      # Funding rate derivatives
│   └── exotic-vault/      # Asian & barrier options
├── packages/
│   └── sdk/               # TypeScript SDK (planned)
├── oracle/                # Oracle service (planned)
├── apps/
│   └── dashboard/         # Trading UI (planned)
├── tests/                 # Integration tests (planned)
└── docs/                  # Implementation plans
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (1.70+)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (1.17+)
- [Anchor](https://www.anchor-lang.com/docs/installation) (0.29+)
- [Node.js](https://nodejs.org/) (18+)

### Installation

```bash
# Clone the repository
git clone https://github.com/psyto/sigma.git
cd sigma

# Install dependencies
npm install

# Build programs
anchor build
```

### Development

```bash
# Run local validator
solana-test-validator

# Deploy to localnet
anchor deploy

# Run tests
anchor test
```

## Documentation

- [Master Roadmap](docs/SIGMA_ROADMAP.md)
- [VolSwap Implementation Plan](docs/VOLSWAP_IMPLEMENTATION_PLAN.md)
- [FundingSwap Implementation Plan](docs/FUNDINGSWAP_IMPLEMENTATION_PLAN.md)
- [ExoticVault Implementation Plan](docs/EXOTICVAULT_IMPLEMENTATION_PLAN.md)

## Use Cases

### Volatility Trading
```
User expects high volatility:
├── Open long variance position in VolSwap
└── Profit if realized vol > strike vol
```

### Funding Rate Arbitrage
```
Funding rate mispricing detected:
├── Open FundingSwap receiver position
├── Open offsetting perp on Drift/Jupiter
└── Capture spread between rates
```

### Path-Dependent Hedging
```
Hedge with manipulation resistance:
├── Buy Asian put option (TWAP-settled)
└── Protected from spot manipulation at expiry
```

### Structured Products
```
Principal Protected Note:
├── 90% in stablecoin yield
├── 10% in Asian call option
└── Downside protected + upside exposure
```

## Roadmap

- [x] Monorepo setup
- [x] Program scaffolding
- [x] Implementation plans
- [ ] Shared oracle completion
- [ ] VolSwap core implementation
- [ ] FundingSwap core implementation
- [ ] ExoticVault core implementation
- [ ] TypeScript SDK
- [ ] Integration tests
- [ ] Security audit
- [ ] Devnet deployment
- [ ] Mainnet beta

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

This software is in active development and has not been audited. Use at your own risk.

If you discover a security vulnerability, please report it privately.

## License

[MIT](LICENSE)

## Acknowledgments

Built on [Solana](https://solana.com) using the [Anchor](https://anchor-lang.com) framework.
