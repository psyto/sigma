# Liquidity Provision

## What Is an LP (Liquidity Provider)?

LPs deposit USDC into Sigma's pools to:
1. **Enable trading**: Traders need counterparties
2. **Earn fees**: Collect portion of trading fees
3. **Take risk**: Take the other side of trader positions

Think of LPs as the "house" in a casino - they provide the capital that makes games possible and collect a statistical edge over time.

---

## Why Would Anyone Provide Liquidity?

### The Opportunity

| Protocol | Typical APY | Risk Level |
|----------|-------------|------------|
| Lending (Aave, Solend) | 3-8% | Low |
| AMM LP (Uniswap, Orca) | 10-30% | Medium |
| **Sigma LP** | 15-40% | Higher |

Sigma LP earns more because:
1. Taking derivatives risk (not just swap fees)
2. Fewer LPs = higher share of fees
3. Complex products = more value capture

### Who Should Be an LP?

**Good Fit**:
- Patient capital (can hold through drawdowns)
- Understands derivatives risk
- Believes in mean reversion (traders lose on average)
- Looking for yield above lending rates

**Bad Fit**:
- Needs immediate liquidity
- Can't stomach 10-20% drawdowns
- Expects guaranteed returns
- Doesn't understand the products

---

## How LP Economics Work

### The Basic Flow

```
1. LP deposits $10,000 USDC into VolSwap pool
2. Receives 10,000 LP shares (1:1 initially)
3. Traders open positions, pay premiums
4. If traders lose: Pool grows, share value increases
5. If traders win: Pool shrinks, share value decreases
6. LP withdraws: Gets USDC based on share value
```

### Share Value Calculation

```
Share Value = Total Pool Value / Total Shares

Example:
- Pool starts: $1,000,000 USDC, 1,000,000 shares
- Share value: $1.00

After trading:
- Traders paid $50,000 in premiums
- Traders won $30,000 in payouts
- Net to pool: +$20,000

New state:
- Pool: $1,020,000 USDC
- Shares: 1,000,000 (unchanged)
- Share value: $1.02 (+2%)
```

### Your P&L as LP

```
Initial deposit: $10,000 (10,000 shares at $1.00)
After 1 month:  Share value = $1.05
Your value:     10,000 × $1.05 = $10,500
Profit:         $500 (5% monthly = 60% APY!)
```

But it can go the other way:

```
Initial deposit: $10,000 (10,000 shares at $1.00)
After 1 month:  Share value = $0.92 (bad month for LPs)
Your value:     10,000 × $0.92 = $9,200
Loss:           -$800 (-8%)
```

---

## The Three LP Pools

### 1. VolSwap Pool

**You're Taking**: The opposite side of variance bets

| Trader Position | LP Position |
|-----------------|-------------|
| Long variance | Short variance |
| Short variance | Long variance |

**Risk Profile**:
- Win when realized variance is moderate
- Lose when variance is extreme (very high or very low)

**APY Range**: 15-35%
**Typical Drawdown**: 5-15%

### 2. FundingSwap Pool

**You're Taking**: Floating rate exposure

| Trader Position | LP Position |
|-----------------|-------------|
| Receive fixed | Pay fixed (receive floating) |
| Pay fixed | Receive fixed (pay floating) |

**Risk Profile**:
- Win when funding rates are moderate
- Lose when funding is extremely high or low

**APY Range**: 10-25%
**Typical Drawdown**: 3-10%

### 3. ExoticVault Pool

**You're Taking**: Option writer positions

| Trader Position | LP Position |
|-----------------|-------------|
| Buy call | Sold call |
| Buy put | Sold put |

**Risk Profile**:
- Win when options expire worthless
- Lose when options pay out significantly

**APY Range**: 20-40%
**Typical Drawdown**: 10-25%

---

## Fees Earned

### Fee Structure

| Fee Type | Amount | Goes To |
|----------|--------|---------|
| Trading fee | 0.1% of notional | LPs |
| Premium | 2-5% of notional | LPs (as counterparty) |
| Early exit penalty | 5% of remaining | LPs |

### Example Fee Calculation

```
VolSwap Pool Stats (monthly):
- Trading volume: $10,000,000
- Average premium: 3%
- Early exits: 5% of positions

Fee income:
- Trading fees: $10M × 0.1% = $10,000
- Premiums: $10M × 3% = $300,000 (but offset by payouts)
- Early exit: $500K × 5% = $25,000

Net premium income (after payouts):
- Traders typically lose 30% of premium on average
- Net: $300,000 × 30% = $90,000

Total LP income: ~$125,000/month
Pool size: $2,000,000
Monthly return: 6.25% (75% APY)
```

---

## Risk Management for LPs

### Utilization Limits

Pools have utilization limits to prevent over-exposure:

```
Pool: $1,000,000
Max utilization: 80%
Maximum exposure: $800,000

If utilization hits 80%:
- No new positions allowed
- Existing positions can still settle
- Protects LPs from tail risk
```

### Withdrawal Restrictions

During high utilization, withdrawals may be limited:

```
Utilization: 60% → Full withdrawal allowed
Utilization: 80% → Partial withdrawal (pro-rata)
Utilization: 95% → Withdrawal queue
```

This prevents bank runs and protects remaining LPs.

### Diversification

Smart LPs spread across pools:

```
Conservative allocation:
- 40% FundingSwap (lowest risk)
- 35% VolSwap (medium risk)
- 25% ExoticVault (highest risk)

Aggressive allocation:
- 25% FundingSwap
- 35% VolSwap
- 40% ExoticVault
```

---

## Historical Performance (Backtested)

### VolSwap Pool

| Period | Volatility Regime | LP Return |
|--------|------------------|-----------|
| Jan 2024 | Low | +8% |
| Feb 2024 | High (ETF hype) | -5% |
| Mar 2024 | Moderate | +6% |
| Apr 2024 | Low | +9% |
| **YTD** | Mixed | **+18%** |

### FundingSwap Pool

| Period | Funding Regime | LP Return |
|--------|---------------|-----------|
| Jan 2024 | Moderate positive | +4% |
| Feb 2024 | Very high positive | +2% |
| Mar 2024 | Negative | -3% |
| Apr 2024 | Moderate positive | +5% |
| **YTD** | Mixed | **+8%** |

### ExoticVault Pool

| Period | Market | LP Return |
|--------|--------|-----------|
| Jan 2024 | Choppy | +10% |
| Feb 2024 | Trending up | -8% |
| Mar 2024 | Ranging | +12% |
| Apr 2024 | Down | +7% |
| **YTD** | Mixed | **+21%** |

---

## Getting Started as LP

### Step 1: Choose Pool(s)

Consider:
- Risk tolerance
- Market view
- Desired APY

### Step 2: Deposit USDC

1. Connect wallet
2. Go to Liquidity page
3. Select pool
4. Enter amount
5. Confirm transaction

### Step 3: Monitor Position

Track:
- Share value changes
- Pool utilization
- Cumulative fees earned

### Step 4: Withdraw (When Ready)

1. Select pool
2. Enter shares to withdraw
3. Receive USDC at current share value
4. Note: 0.1% withdrawal fee

---

## Common Questions

### Q: Can I lose more than I deposited?

**No.** Your maximum loss is your deposit. You cannot be liquidated or owe money.

### Q: How long should I LP?

**Minimum 1-3 months recommended.** Short-term variance can be high, but over time the statistical edge compounds.

### Q: What happens if pool runs out of money?

**Impossible by design.** Utilization limits prevent this. Worst case: you lose your deposit, but never more.

### Q: Can I LP and trade?

**Yes!** Many sophisticated users do both:
- LP for yield
- Trade to express specific views
- Net exposure can be managed

### Q: When is the worst time to LP?

- Before major volatility events (VolSwap)
- When funding is extreme (FundingSwap)
- When market is strongly trending (ExoticVault)

### Q: When is the best time to LP?

- After volatility spikes (mean reversion)
- When funding normalizes
- When market is ranging

---

## LP vs. Other Yield Sources

| Source | APY | Risk | Liquidity |
|--------|-----|------|-----------|
| Staking (SOL) | 7% | Low | 2-day unlock |
| Lending | 5-10% | Low | Instant |
| AMM LP | 15-30% | Medium | Instant |
| **Sigma LP** | 15-40% | Higher | Some limits |
| Perp LP (GLP) | 20-50% | High | Instant |

Sigma LP offers competitive yields with unique risk exposures not correlated to other DeFi yields.
