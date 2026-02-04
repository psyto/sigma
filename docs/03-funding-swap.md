# FundingSwap - Funding Rate Derivatives

## What Is a Funding Swap?

A funding swap lets you exchange **floating funding rates** for **fixed rates**, or vice versa.

If you've ever held a perpetual futures position, you know funding rates can be unpredictable. FundingSwap lets you lock in certainty.

---

## Why Would Anyone Want This?

### The Funding Rate Problem

When holding perpetual futures positions:

**Long Position** (you're bullish):
- When funding is positive: You PAY shorts
- When funding is negative: You RECEIVE from shorts

**Short Position** (you're bearish):
- When funding is positive: You RECEIVE from longs
- When funding is negative: You PAY longs

### Real Pain Point

```
Example: You're long $100,000 SOL perpetual

Funding rates over 30 days:
Day 1-5:    +0.02% every 8 hours  →  Pay $60/day = $300
Day 6-15:   +0.05% every 8 hours  →  Pay $150/day = $1,500
Day 16-25:  +0.10% every 8 hours  →  Pay $300/day = $3,000
Day 26-30:  +0.03% every 8 hours  →  Pay $90/day = $450

Total funding paid: $5,250 (5.25% of position!)
```

This unpredictability makes it hard to:
- Calculate trade profitability
- Budget for position costs
- Hold positions long-term

### The Solution: Lock In Fixed Rate

With FundingSwap:
```
You agree to: Pay 0.04% fixed per 8 hours
You receive:  Actual floating funding rate

If floating > 0.04%: You profit
If floating < 0.04%: You lose
But your NET cost is always 0.04%!
```

---

## Who Uses Funding Swaps?

### 1. Perp Traders Hedging Costs

**Scenario**: You're long SOL perp for the next month
- Current funding: +0.03%/8h
- You lock in 0.04% fixed
- Now your costs are predictable: exactly 3.6%/month

### 2. Basis Traders

**What's Basis Trading?**
- Buy spot SOL
- Short SOL perpetual
- Collect funding payments (when positive)

**The Risk**: Funding can go negative, erasing profits

**With FundingSwap**:
- Lock in fixed rate you RECEIVE
- Guaranteed profit regardless of funding fluctuation

### 3. Funding Rate Speculators

**Your View**: "Funding will stay high because market is bullish"
- Pay fixed 0.03%
- Receive floating (expect 0.08%)
- Profit the difference

**Your View**: "Funding will drop as market cools"
- Receive fixed 0.05%
- Pay floating (expect 0.02%)
- Profit the difference

---

## How Does It Work?

### Two Sides of the Swap

| Position | You Pay | You Receive | Profit When |
|----------|---------|-------------|-------------|
| **Receive Fixed** | Floating rate | Fixed rate | Floating < Fixed |
| **Pay Fixed** | Fixed rate | Floating rate | Floating > Fixed |

### Settlement Flow

```
Every Funding Period (8 hours):
───────────────────────────────────────────────────

Floating Rate: 0.05%
Your Fixed Rate: 0.03%

If you PAY FIXED:
  You pay: 0.03%
  You receive: 0.05%
  Net: +0.02% profit ✓

If you RECEIVE FIXED:
  You receive: 0.03%
  You pay: 0.05%
  Net: -0.02% loss ✗

───────────────────────────────────────────────────
```

### Cumulative P&L

Over 30 days (90 funding periods):
```
Day 1-10:  Floating avg 0.05%, Fixed 0.03%  →  +0.02% × 30 = +0.60%
Day 11-20: Floating avg 0.02%, Fixed 0.03%  →  -0.01% × 30 = -0.30%
Day 21-30: Floating avg 0.04%, Fixed 0.03%  →  +0.01% × 30 = +0.30%

Total P&L (Pay Fixed): +0.60%
On $100,000: +$600 profit
```

---

## Practical Examples

### Example 1: Hedging Your Long Perp

**Situation**:
- You're long $50,000 SOL perp
- Planning to hold for 2 weeks
- Current funding: 0.04%/8h (volatile lately)

**Without Hedge**:
- Best case: Funding drops, you pay less
- Worst case: Funding spikes to 0.15%, you pay $3,150 in 2 weeks

**With FundingSwap**:
```
Open FundingSwap:
- Side: Receive Fixed
- Fixed Rate: 0.04%
- Notional: $50,000
- Duration: 14 days
```

Now:
- Your perp pays floating funding
- Your swap receives floating, pays fixed
- Net: You always pay 0.04% = predictable $840/2 weeks

### Example 2: Speculating on High Funding

**Situation**:
- SOL just pumped 30%
- Funding rate is 0.03%/8h
- You think FOMO will push funding to 0.10%+

**Your Trade**:
```
Open FundingSwap:
- Side: Pay Fixed
- Fixed Rate: 0.035%
- Notional: $25,000
- Duration: 7 days
```

**Outcome**:
- Average funding over 7 days: 0.08%
- You pay: 0.035% × 21 periods = 0.735%
- You receive: 0.08% × 21 periods = 1.68%
- Net profit: 0.945% = $236

### Example 3: Basis Trade Enhancement

**Traditional Basis Trade**:
```
Position 1: Long 100 SOL spot at $100 = $10,000
Position 2: Short 100 SOL perp at $100.50 = $10,050

Initial edge: 0.5% = $50
Plus: Collect positive funding
Risk: Funding goes negative
```

**Enhanced with FundingSwap**:
```
Position 3: Receive Fixed at 0.02%/8h

Now you lock in:
- Initial basis: $50
- Fixed funding: 0.02% × 3 × 30 = 1.8%/month = $180/month
- Total guaranteed: $230/month (27.6% APY!)
```

---

## Risk Factors

### For "Receive Fixed" (Pay Floating)

| Risk | Scenario | Impact |
|------|----------|--------|
| High floating | Funding spikes | You pay more than you receive |
| Duration | Locked in bad rate | Can't exit without penalty |

### For "Pay Fixed" (Receive Floating)

| Risk | Scenario | Impact |
|------|----------|--------|
| Low floating | Market calms down | You pay more than you receive |
| Negative funding | Bear market | You pay both ways |

### General Risks

- **Counterparty**: LPs must remain solvent
- **Oracle**: Funding rate data must be accurate
- **Liquidity**: May not be able to exit early

---

## Parameters

| Parameter | Description | Range |
|-----------|-------------|-------|
| Notional | Size of swap | $1,000 - $500,000 |
| Fixed Rate | Locked rate per 8h | -0.1% to +0.5% |
| Duration | Contract length | 7, 14, 30, 90 days |
| Collateral | Required margin | 10% of notional |
| Fee | Protocol fee | 0.1% of notional |

---

## Fixed Rate Determination

The fixed rate offered depends on:

1. **Current funding rate**: Base reference
2. **Historical average**: Where funding typically sits
3. **Market sentiment**: Bull = higher rates
4. **Duration**: Longer = more uncertainty premium
5. **LP supply/demand**: More LPs = tighter rates

```
Example Rate Calculation:
- Current funding: 0.04%
- 7-day average: 0.035%
- Market: Bullish
- Duration: 14 days

Fixed rate offered:
- Receive fixed: 0.032% (slightly below avg)
- Pay fixed: 0.042% (slightly above current)
- Spread: 1 bps (protocol revenue)
```

---

## Comparison to Alternatives

| Method | Predictability | Cost | Complexity |
|--------|---------------|------|------------|
| FundingSwap | Perfect | Low spread | Simple |
| Close perp, open futures | Perfect | High (basis cost) | Complex |
| Just accept funding | None | Variable | None |
| Hedge with options | Partial | High premium | Complex |

**FundingSwap is the most capital-efficient way to manage funding rate exposure.**
