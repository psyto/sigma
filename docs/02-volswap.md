# VolSwap - Variance Swaps

## What Is a Variance Swap?

A variance swap is a derivative that lets you trade **realized volatility** directly, without taking a directional bet on price.

- **Long variance**: Profit when markets are volatile (big price swings)
- **Short variance**: Profit when markets are calm (small price swings)

---

## Why Would Anyone Want This?

### Problem: You Expect Volatility But Don't Know Direction

Imagine SOL is at $100. You believe:
- Big news is coming (ETF decision, upgrade, etc.)
- Price will move significantly
- But you don't know if it will go up or down

**Traditional Approach: Straddle**
- Buy a $100 call: costs $5
- Buy a $100 put: costs $5
- Total cost: $10 (10% of spot)
- Need SOL to move >10% just to break even

**VolSwap Approach**
- Open a long variance position
- Pay ~3% premium
- Profit if realized variance > strike variance
- No need to predict direction

### Real-World Use Cases

1. **Event Trading**
   - Elections, protocol upgrades, ETF decisions
   - You know volatility will spike, but direction is uncertain

2. **Hedging Volatility Exposure**
   - Market makers are naturally short volatility
   - Use VolSwap to hedge when expecting turbulence

3. **Relative Value**
   - Implied variance is 40%, you think realized will be 50%
   - Long variance at 40% strike, profit the 10% difference

4. **Income Generation**
   - You think markets will be calm
   - Short variance, collect premium

---

## How Does It Work?

### Key Concepts

**Variance**: A measure of how much price moves around its average
- High variance = big daily moves (volatile)
- Low variance = small daily moves (calm)

**Realized Variance**: The actual variance measured over the contract period

**Strike Variance**: The "price" you're betting against

### The Trade

```
Your Position    Market Outcome       Your P&L
─────────────    ──────────────       ────────
Long Variance    Realized > Strike    PROFIT ✓
Long Variance    Realized < Strike    LOSS ✗

Short Variance   Realized < Strike    PROFIT ✓
Short Variance   Realized > Strike    LOSS ✗
```

### Payoff Formula

```
Payout = Notional × (Realized Variance - Strike Variance) / Strike Variance
```

**Example - Long Variance**:
- Notional: $10,000
- Strike Variance: 30%
- Realized Variance: 45%
- Payout: $10,000 × (45% - 30%) / 30% = $5,000 profit

**Example - Short Variance**:
- Notional: $10,000
- Strike Variance: 30%
- Realized Variance: 20%
- Payout: $10,000 × (20% - 30%) / 30% = -$3,333
- But you're short, so you PROFIT $3,333

---

## Epochs: How Settlement Works

VolSwap uses **epochs** (time periods) for settlement:

```
Epoch Timeline
─────────────────────────────────────────────────────────
│ Epoch 1 (7 days) │ Epoch 2 (7 days) │ Epoch 3 (7 days) │
─────────────────────────────────────────────────────────
        ↓                   ↓                   ↓
   Variance 32%        Variance 45%       Variance 28%
        ↓                   ↓                   ↓
   Settlement          Settlement          Settlement
```

1. **Open Position**: Choose long/short, notional, duration
2. **Epoch Runs**: Oracle measures price movements, calculates variance
3. **Settlement**: At epoch end, P&L calculated and distributed
4. **Multi-Epoch**: Positions can span multiple epochs

---

## Practical Example

### Scenario: SOL ETF Decision

**Date**: January 15th
**Event**: SEC decision on SOL ETF expected January 20th
**Current SOL**: $100
**Current Implied Variance**: 35%

**Your View**: "The decision will cause a big move either way. I think realized variance will be 50%+."

**Your Trade**:
```
Position: Long Variance
Notional: $10,000
Strike: 35%
Duration: 7 days
Premium: $300 (3%)
```

**Outcome A - High Volatility (You Win)**:
- ETF approved! SOL rockets to $130, then corrects to $115
- Realized variance: 55%
- Payout: $10,000 × (55% - 35%) / 35% = $5,714
- Net profit: $5,714 - $300 = $5,414

**Outcome B - Low Volatility (You Lose)**:
- Decision delayed, market shrugs
- SOL moves from $100 to $102
- Realized variance: 20%
- Payout: $10,000 × (20% - 35%) / 35% = -$4,286
- Net loss: -$4,286 - $300 = -$4,586

---

## Risk Management

### For Long Variance

| Risk | Description | Mitigation |
|------|-------------|------------|
| Low volatility | Market is calm, you lose | Size positions appropriately |
| Premium paid | Lost even if break-even | Factor into expected value |
| Timing | Volatility spikes after expiry | Choose duration carefully |

### For Short Variance

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Unlimited loss** | Variance can spike massively | Use stop-losses, size small |
| Black swan events | Unexpected crashes/pumps | Never short more than you can lose |
| Correlation | Variance often spikes together | Diversify timing |

---

## Who Are the Counterparties?

When you go **long variance**:
- LPs in the VolSwap pool take the other side
- They're effectively short variance
- They earn premium but risk variance spikes

When you go **short variance**:
- You provide "insurance" against volatility
- Earn premium from long variance traders
- LPs may also take long variance

---

## Parameters in Sigma

| Parameter | Description | Typical Value |
|-----------|-------------|---------------|
| Notional | Position size | $1,000 - $100,000 |
| Strike | Variance level to beat | Market implied |
| Duration | Contract length | 7, 14, 28 days |
| Premium | Upfront cost | 2-5% of notional |
| Fee | Protocol fee | 0.1% of notional |

---

## Comparison to Alternatives

| Method | Cost | Complexity | Directional Risk |
|--------|------|------------|------------------|
| Variance Swap | 2-4% | Low | None |
| Straddle | 8-12% | Medium | None |
| Strangle | 5-8% | Medium | Some |
| VIX futures | Varies | High | None |

**Variance swaps are the purest, most capital-efficient way to trade volatility.**
