# Sigma Protocol Overview

## What Problem Does Sigma Solve?

### The Gap in DeFi

Current DeFi offers:
- Spot trading (swap tokens)
- Perpetual futures (leveraged directional bets)
- Basic options (calls/puts)

But traditional finance has much more sophisticated instruments that let traders:
- Bet on **volatility itself** (not price direction)
- **Hedge funding costs** when holding perpetual positions
- Use **exotic options** with cheaper premiums and unique payoffs

**Sigma brings these institutional tools to DeFi.**

---

## Why Would Users Care?

### 1. Volatility Trading (VolSwap)

**The Problem**: You think the market will be volatile, but you don't know if prices will go up or down.

**Traditional Solution**: Buy both calls and puts (straddle) - expensive!

**Sigma Solution**: Buy a variance swap - pure volatility exposure at lower cost.

**Who Uses This**:
- Traders expecting big moves around events (elections, ETF decisions, upgrades)
- Market makers hedging their volatility exposure
- Anyone who wants to profit from chaos without picking a direction

---

### 2. Funding Rate Hedging (FundingSwap)

**The Problem**: You're holding a perpetual futures position, but funding rates are unpredictable. Sometimes you pay 0.01%/8h, sometimes 0.1%/8h. This uncertainty eats into profits.

**Example**:
- You're long SOL perp with $100,000 notional
- Funding rate swings between 0.01% and 0.15% per 8 hours
- At 0.15%, you pay $150/day = $4,500/month!

**Sigma Solution**: Lock in a fixed funding rate. Pay 0.05% fixed, receive the floating rate. Now your costs are predictable.

**Who Uses This**:
- Perp traders wanting predictable costs
- Basis traders (spot + short perp arbitrage)
- Anyone tired of funding rate surprises

---

### 3. Cheaper Options (ExoticVault)

**The Problem**: Vanilla options are expensive. A 7-day ATM call might cost 5% of the notional.

**Sigma Solution**: Exotic options with lower premiums:

| Option Type | Premium | Trade-off |
|------------|---------|-----------|
| Vanilla Call | 5% | No restrictions |
| Asian Call | 3.5% | Settled on TWAP, not spot |
| Knock-Out Call | 2.5% | Dies if price hits barrier |
| Knock-In Call | 2% | Only activates if price hits barrier |

**Who Uses This**:
- Traders who want leveraged upside but can't afford vanilla options
- Those with specific views on price paths
- Sophisticated traders optimizing premium spend

---

## How Does Sigma Make Money?

### For Traders
- Pay premiums/fees to open positions
- Profit or lose based on market outcomes

### For Liquidity Providers (LPs)
- Deposit USDC into protocol pools
- Earn fees from trading activity
- Take the other side of trader positions
- **Higher risk, higher reward** compared to lending protocols

### Fee Structure
- Trading fees: 0.1% of notional
- Premium: Varies by product and duration
- Early exit penalty: 5% of remaining value

---

## Risk Disclosure

### For Traders
- **VolSwap**: Unlimited loss if volatility goes against you
- **FundingSwap**: Loss if funding moves against your fixed rate
- **ExoticVault**: Option premium lost if option expires worthless

### For LPs
- **Impermanent loss**: Pool value changes based on trader P&L
- **Utilization risk**: Funds locked during high utilization
- **Smart contract risk**: Code vulnerabilities

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Sigma Protocol                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   VolSwap    │  │ FundingSwap  │  │ ExoticVault  │       │
│  │              │  │              │  │              │       │
│  │ - Long Vol   │  │ - Receive    │  │ - Asian Opts │       │
│  │ - Short Vol  │  │   Fixed      │  │ - Barrier    │       │
│  │ - Epochs     │  │ - Pay Fixed  │  │   Options    │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └────────────┬────┴────────────────┘                │
│                      │                                       │
│              ┌───────▼───────┐                              │
│              │ Shared Oracle │                              │
│              │               │                              │
│              │ - Price Feeds │                              │
│              │ - TWAP        │                              │
│              │ - Variance    │                              │
│              │ - Funding     │                              │
│              └───────────────┘                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   LP Pools                            │   │
│  │  Provide liquidity → Earn fees → Take trader risk    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Comparison to Competitors

| Feature | Sigma | Lyra | Dopex | Ribbon |
|---------|-------|------|-------|--------|
| Variance Swaps | ✅ | ❌ | ❌ | ❌ |
| Funding Swaps | ✅ | ❌ | ❌ | ❌ |
| Asian Options | ✅ | ❌ | ❌ | ❌ |
| Barrier Options | ✅ | ❌ | ❌ | ❌ |
| Chain | Solana | Arbitrum | Arbitrum | Ethereum |
| Settlement | TWAP/Spot | Spot | Spot | Spot |

**Sigma is the only protocol offering all four derivative types.**
