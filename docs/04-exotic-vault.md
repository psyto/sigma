# ExoticVault - Asian & Barrier Options

## What Are Exotic Options?

Exotic options are options with special features that make them different from standard "vanilla" calls and puts. They're called "exotic" because they have unique payoff structures.

Sigma offers two types:
1. **Asian Options**: Settled on average price (TWAP), not spot price
2. **Barrier Options**: Activated or deactivated when price hits a level

---

## Why Would Anyone Want These?

### The Problem with Vanilla Options: They're Expensive

A standard 7-day call option might cost 5% of the notional. Why?
- You're buying unlimited upside
- Market makers need to hedge dynamically
- They charge for this risk

### The Solution: Trade Features for Lower Premium

Exotic options give up some features in exchange for cheaper premiums:

| Option Type | Premium | What You Give Up |
|-------------|---------|------------------|
| Vanilla Call | 5.0% | Nothing |
| Asian Call | 3.5% | Settled on average, not spot |
| Knock-Out Call | 2.5% | Option dies if barrier hit |
| Knock-In Call | 2.0% | Option only exists if barrier hit |

**Same directional exposure, 40-60% cheaper.**

---

# Asian Options

## What Are They?

Asian options are settled based on the **Time-Weighted Average Price (TWAP)** over the option's life, not the final spot price.

```
Standard Option:
  Payoff = max(Final Price - Strike, 0)

Asian Option:
  Payoff = max(Average Price - Strike, 0)
```

## Why Are They Cheaper?

Averaging reduces volatility:
- Final price could be anywhere
- Average price is more predictable
- Less risk for market makers = lower premium

## Who Uses Asian Options?

### 1. Cost-Conscious Directional Traders

**Your View**: "SOL will trend upward over the next 2 weeks"

With vanilla: Pay 5% premium
With Asian: Pay 3.5% premium, same directional exposure

### 2. Protection Against Manipulation

**Concern**: "What if someone manipulates the price at expiry?"

Asian options solve this - you can't manipulate a 2-week average easily.

### 3. Hedgers with Average Exposure

**Scenario**: A fund needs to buy SOL over the next month
- They'll buy gradually at different prices
- Their effective cost is the average
- Asian put hedges their actual exposure perfectly

## Asian Option Example

**Trade Setup**:
```
Type: Asian Call
Strike: $95
Notional: $10,000
Duration: 14 days
Premium: $350 (3.5%)
Current SOL: $100
```

**Price Path**:
```
Day 1-7:   SOL ranges $98-$105, avg = $101
Day 8-14:  SOL ranges $103-$112, avg = $107

TWAP (overall average): $104
```

**Settlement**:
```
Payoff = max($104 - $95, 0) / $95 × $10,000
       = $9 / $95 × $10,000
       = $947

Net Profit: $947 - $350 = $597
```

**Compare to Vanilla**:
If final price was $112 (spike at end):
- Vanilla payoff: ($112-$95)/$95 × $10,000 = $1,789
- Asian payoff: ($104-$95)/$95 × $10,000 = $947

Asian is lower, but you paid 30% less premium!

---

# Barrier Options

## What Are They?

Barrier options have a **trigger price** (barrier) that either:
- **Knock-Out**: Kills the option if touched
- **Knock-In**: Activates the option if touched

Combined with direction:
- **Up barriers**: Above current price
- **Down barriers**: Below current price

## The Four Types

| Type | Barrier | Effect | Best For |
|------|---------|--------|----------|
| **Up-and-Out Call** | Above spot | Call dies if price rises too much | Capped upside view |
| **Down-and-Out Call** | Below spot | Call dies if price drops | Bullish, but not if dump |
| **Up-and-In Put** | Above spot | Put activates if price rises | Bearish after fake pump |
| **Down-and-In Put** | Below spot | Put activates if price drops | Bearish confirmation |

## Why Are They Cheaper?

You're giving up scenarios:
- **Knock-out**: Option might die before expiry
- **Knock-in**: Option might never activate

Less coverage = lower premium.

---

## Knock-Out Options Explained

### Up-and-Out Call

**Scenario**: You're bullish on SOL, but think it won't go above $120

```
SOL Price: $100
Strike: $100
Barrier: $120
Premium: 2.5%
```

**Outcome A - Moderate Rise (You Win)**:
- SOL rises to $115 at expiry
- Never touched $120
- Payoff: ($115-$100)/$100 × notional = 15%
- Net: 15% - 2.5% = 12.5% profit

**Outcome B - Big Rise (Knocked Out)**:
- SOL spikes to $125 on day 5
- Option DIES at that moment
- Payoff: $0
- Net: -2.5% (premium lost)

**Outcome C - Price Falls (Expires Worthless)**:
- SOL drops to $90
- Option expires worthless
- Net: -2.5% (premium lost)

### Down-and-Out Call

**Scenario**: You're bullish but think if SOL dumps below $85, the thesis is broken

```
SOL Price: $100
Strike: $100
Barrier: $85
Premium: 2.8%
```

**Why Use This?**
- You believe in upside
- But if it dumps hard, you'd have exited anyway
- Get cheaper premium by acknowledging this

---

## Knock-In Options Explained

### Down-and-In Put

**Scenario**: You're neutral but want protection if things crash

```
SOL Price: $100
Strike: $95
Barrier: $88
Premium: 1.8%
```

**Logic**: "I only need a put if there's a real crash. If SOL stays above $88, everything's fine."

**Outcome A - Crash Happens (Knock-In + ITM)**:
- Day 5: SOL drops to $85 (barrier hit, put activates)
- Expiry: SOL at $80
- Payoff: ($95-$80)/$95 × notional = 15.8%
- Net: 15.8% - 1.8% = 14% profit

**Outcome B - Crash Happens (Knock-In but OTM)**:
- Day 5: SOL drops to $87 (barrier hit)
- Expiry: SOL recovers to $97
- Put is active but out-of-money
- Payoff: $0
- Net: -1.8% (premium lost)

**Outcome C - No Crash (Never Knocks In)**:
- SOL stays above $88 entire period
- Put never activates
- Payoff: $0
- Net: -1.8% (premium lost)

### Up-and-In Put

**Scenario**: You think there might be a blow-off top followed by crash

```
SOL Price: $100
Strike: $105
Barrier: $115
Premium: 2.2%
```

**Logic**: "If SOL pumps to $115, that's euphoria. I want puts ready for the dump."

---

## Choosing the Right Option

### Decision Tree

```
Want directional exposure?
│
├─ Yes, bullish → CALL
│   │
│   ├─ Want cheapest? → Knock-Out Call (barrier above)
│   ├─ Want averaging? → Asian Call
│   └─ Want full coverage? → Vanilla Call (not on Sigma)
│
└─ Yes, bearish → PUT
    │
    ├─ Want crash protection only? → Knock-In Put (barrier below)
    ├─ Want cheaper downside? → Knock-Out Put (barrier below)
    └─ Want averaging? → Asian Put
```

### Premium Comparison

For 7-day ATM options on SOL:

| Type | Premium | Max Payout | Risk |
|------|---------|------------|------|
| Asian Call | 3.5% | Unlimited* | Lower payoff due to averaging |
| Up-and-Out Call | 2.5% | Capped | Option dies on big moves |
| Down-and-In Call | 2.0% | Unlimited | May never activate |

*"Unlimited" means proportional to price move, not actually infinite

---

## Risk Considerations

### Asian Options

| Risk | Description | Mitigation |
|------|-------------|------------|
| Lower payoff | Average < Final in trending markets | Accept trade-off for lower premium |
| TWAP manipulation | Sophisticated attack on average | Oracle uses multiple sources |

### Knock-Out Options

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Knockout risk** | Option dies at worst time | Set barrier with buffer |
| Wicks | Brief spike triggers knockout | Accept or use wider barrier |
| Gap risk | Price gaps through barrier | Barrier set at next price (protective) |

### Knock-In Options

| Risk | Description | Mitigation |
|------|-------------|------------|
| Never activates | Premium wasted | Only use when specific view |
| Activates but OTM | Worst outcome - paid premium, no payoff | Set realistic strike |

---

## Example Strategies

### Strategy 1: Cheap Bullish Bet

**View**: SOL will rise 10-20% but not moon to 50%+

```
Trade: Up-and-Out Call
Spot: $100
Strike: $100
Barrier: $140 (40% up)
Premium: 2.2%
Duration: 14 days
```

**Max profit**: If SOL at $139 = 39% - 2.2% = 36.8%
**Risk**: Premium lost if SOL >$140 or <$100

### Strategy 2: Crash Insurance

**View**: Want cheap protection against black swan

```
Trade: Down-and-In Put
Spot: $100
Strike: $90
Barrier: $80
Premium: 1.5%
Duration: 30 days
```

**Logic**: Only pays if real crash (>20% down), very cheap insurance

### Strategy 3: Range-Bound with Downside View

**View**: SOL will be choppy but trend down

```
Trade: Asian Put
Spot: $100
Strike: $98
Premium: 3.2%
Duration: 14 days
```

**Why Asian?**: Choppy = lots of averaging = TWAP reflects trend, not noise

---

## Parameters

| Parameter | Description | Constraints |
|-----------|-------------|-------------|
| Option Type | Asian/KO/KI + Call/Put | 6 combinations |
| Strike | Target price | Must be > 0 |
| Barrier | Trigger price (barrier opts) | Must be logically valid* |
| Notional | Position size | $100 - $100,000 |
| Duration | Time to expiry | 7, 14, 30 days |

*Logical barrier rules:
- Up-barrier: Must be above strike for calls
- Down-barrier: Must be below strike for puts
