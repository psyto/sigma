# Real-World Use Cases

This document provides practical scenarios showing how traders and institutions might use Sigma.

---

## Use Case 1: Event Volatility Trading

### Scenario

**Event**: Bitcoin spot ETF decision expected January 10th
**Current Date**: January 5th
**Your View**: "This will cause massive volatility regardless of outcome"

### The Problem

You want to profit from volatility, but:
- If approved: BTC moons, SOL follows
- If rejected: Everything dumps
- You don't know which!

### Traditional Approach

Buy a straddle (call + put):
- SOL at $100
- Buy $100 call: $6
- Buy $100 put: $5
- Total: $11 (11% of position)
- Need 11%+ move just to break even

### Sigma Solution

Open long variance position:
```
Protocol: VolSwap
Position: Long Variance
Notional: $20,000
Strike: 35% (current implied)
Duration: 7 days
Premium: $600 (3%)
```

### Outcomes

**Outcome A: Approval + Moon**
- SOL: $100 → $85 → $140 (wild swings)
- Realized variance: 85%
- Payout: $20,000 × (85% - 35%) / 35% = $28,571
- Profit: $28,571 - $600 = **$27,971**

**Outcome B: Rejection + Dump**
- SOL: $100 → $75 → $82 (big drop, some recovery)
- Realized variance: 72%
- Payout: $20,000 × (72% - 35%) / 35% = $21,143
- Profit: $21,143 - $600 = **$20,543**

**Outcome C: Delayed Decision**
- SOL: $100 → $98 → $101 (nothing happens)
- Realized variance: 18%
- Payout: $20,000 × (18% - 35%) / 35% = -$9,714
- Loss: **-$9,714 - $600 = -$10,314**

### Key Insight

With VolSwap, you profit from ANY big move. The straddle would cost more and have worse payoff profile for the same scenario.

---

## Use Case 2: Basis Trade with Guaranteed Yield

### Scenario

**You Have**: $100,000 in USDC
**You Want**: Low-risk yield without directional exposure
**Current State**:
- SOL spot: $100
- SOL perp: $100.30 (0.3% premium)
- Funding rate: +0.03%/8h (longs pay shorts)

### Traditional Basis Trade

```
Step 1: Buy 1000 SOL spot ($100,000)
Step 2: Short 1000 SOL perp ($100,300)

Profit sources:
- Initial basis: $300
- Funding received: ~0.03%/8h = ~2.7%/month

Risk:
- Funding can flip negative
- You'd lose instead of gain
```

### Enhanced with FundingSwap

```
Step 3: Open FundingSwap
Protocol: FundingSwap
Position: Receive Fixed
Fixed Rate: 0.025%/8h
Notional: $100,000
Duration: 30 days
```

### Combined Position

Now you have:
1. **Spot long + Perp short** = Delta neutral
2. **FundingSwap** = Locked in funding income

Guaranteed monthly income:
- Basis: $300
- Fixed funding: 0.025% × 3 × 30 = 2.25%/month = $2,250

**Total**: $2,550/month = **30.6% APY with ZERO directional risk**

### Risk Comparison

| Risk | Without FundingSwap | With FundingSwap |
|------|---------------------|------------------|
| Funding flips negative | Lose money | Still profit |
| Funding drops to 0.01% | Make less | Still make 2.25% |
| Funding spikes to 0.1% | Make more | Miss upside |

---

## Use Case 3: Cheap Downside Protection

### Scenario

**Your Portfolio**: 500 SOL ($50,000 at $100)
**Your View**: "Long-term bullish, but worried about a crash"
**Budget**: Don't want to spend more than 2% on protection

### Traditional Put

A 30-day ATM put would cost ~5-6%. Too expensive.

### Sigma Solution: Down-and-In Put

```
Protocol: ExoticVault
Option: Down-and-In Put
Spot: $100
Strike: $95
Barrier: $85 (only activates on 15% crash)
Notional: $50,000
Duration: 30 days
Premium: $900 (1.8%)
```

### How It Works

**No Crash (SOL stays above $85)**:
- Put never activates
- You lose $900 premium
- But your portfolio is fine anyway!

**Crash Happens (SOL drops to $75)**:
- Day 10: SOL hits $85 → Put activates
- Expiry: SOL at $75
- Payoff: ($95-$75)/$95 × $50,000 = $10,526
- Net: $10,526 - $900 = **$9,626 protection**

### Cost Comparison

| Protection | Cost | Covers |
|------------|------|--------|
| Vanilla Put | $2,750 (5.5%) | Any drop below $95 |
| Down-and-In Put | $900 (1.8%) | Crashes below $85 |

**You save 67% on premium by accepting you don't need protection for small dips.**

---

## Use Case 4: Range-Bound Market Strategy

### Scenario

**Market View**: "SOL will chop between $90-$110 for the next month"
**You Want**: Make money from this choppiness

### Strategy: Short Variance + Asian Options

**Part 1: Short Variance**
```
Protocol: VolSwap
Position: Short Variance
Notional: $15,000
Strike: 40% (market expects volatility)
Duration: 14 days
Premium Received: $450
```

**Part 2: Sell Asian Call (via LP)**

By being an LP in ExoticVault, you effectively sell options:
```
Deposit: $10,000 to ExoticVault pool
Expected yield: 2-4% for 2 weeks in ranging market
```

### Combined Expected Return

If market chops as expected:
- Short variance profit: $15,000 × (40% - 28%) / 40% = $4,500
- LP yield: ~$300

**Total: ~$4,800 profit on $25,000 capital = 19% in 2 weeks**

### Risks

If SOL trends strongly (breaks $90 or $110):
- Variance will spike → Short variance loses
- Options will pay out → LP loses

---

## Use Case 5: Perp Position Hedging

### Scenario

**Your Position**: Long 200 SOL perp at $95 (entry)
**Current Price**: $105
**Your View**: "Want to hold for upside, but worried about funding"

### The Problem

- Funding rate: 0.08%/8h (very high due to bullish market)
- Daily cost: 0.24% = $50/day on $21,000 position
- Monthly: $1,500 in funding!

This eats into your $2,000 unrealized profit.

### Solution: Hedge Funding with FundingSwap

```
Protocol: FundingSwap
Position: Receive Fixed
Fixed Rate: 0.06%/8h
Notional: $21,000
Duration: 14 days
```

### Outcome Analysis

**Your perp position pays**: Floating rate (0.08%)
**Your swap receives**: 0.08%, pays 0.06%
**Net swap P&L**: +0.02%/8h
**Net funding cost**: 0.08% - 0.02% = **0.06%** (locked in)

**Monthly cost reduced from $1,500 to ~$1,130 = $370 savings**

If funding drops to 0.03%:
- Without hedge: You'd save money
- With hedge: You pay the difference (0.06% - 0.03% = 0.03%)

**Trade-off**: Certainty vs. potential upside

---

## Use Case 6: LP Yield Farming Strategy

### Scenario

**Capital**: $50,000 USDC
**Goal**: Maximize yield with acceptable risk
**Time Horizon**: 3+ months

### Strategy: Diversified LP with Timing

**Allocation**:
```
FundingSwap Pool: $20,000 (40%) - Lower risk
VolSwap Pool:     $15,000 (30%) - Medium risk
ExoticVault Pool: $15,000 (30%) - Higher risk
```

**Timing Adjustments**:

| Market Condition | Action |
|------------------|--------|
| Post-volatility spike | Add to VolSwap (variance will mean-revert) |
| High funding | Add to FundingSwap (rates will normalize) |
| Ranging market | Add to ExoticVault (options expire worthless) |
| Pre-event | Reduce all (let traders take risk) |

### Expected Returns (Conservative)

```
FundingSwap: $20,000 × 12% APY = $2,400/year
VolSwap:     $15,000 × 20% APY = $3,000/year
ExoticVault: $15,000 × 25% APY = $3,750/year

Total: $9,150/year = 18.3% blended APY
```

### Realistic Expectations

- Good months: +5-10%
- Bad months: -3-8%
- Annual expectation: 15-25%
- Max drawdown: -15-20%

---

## Use Case 7: Market Maker Hedging

### Scenario

**You Are**: A market maker providing liquidity on Jupiter/Raydium
**Your Risk**: Naturally short gamma (lose money on big moves)
**Problem**: Can't predict when big moves happen

### Solution: Long Variance Hedge

As a market maker, you have natural short volatility exposure. Every big move costs you money through adverse selection.

**Hedge with VolSwap**:
```
Protocol: VolSwap
Position: Long Variance
Notional: Scaled to your daily volume (e.g., $50,000)
Duration: Rolling weekly
Strike: At current implied
```

### How It Works

**Normal Day (low volatility)**:
- MM profits from spread
- VolSwap loses a bit
- Net: Profitable

**Volatile Day**:
- MM loses from adverse selection
- VolSwap profits significantly
- Net: Hedged!

**Cost of Insurance**: ~2-4% per week on notional
**Risk Reduced**: Tail risk from unexpected moves

---

## Summary: Who Uses What

| User Type | Primary Protocol | Strategy |
|-----------|------------------|----------|
| Event trader | VolSwap | Long variance before events |
| Basis trader | FundingSwap | Lock in funding yield |
| Portfolio hedger | ExoticVault | Cheap puts via barriers |
| Yield farmer | LP Pools | Diversified provision |
| Perp trader | FundingSwap | Hedge funding costs |
| Market maker | VolSwap | Hedge gamma exposure |
| Volatility seller | VolSwap | Short variance for income |

Each protocol serves distinct needs - that's the power of having multiple derivative types in one suite.
