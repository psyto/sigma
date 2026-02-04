# Liquidity Strategy: Who Will LP and Why?

## The Cold Start Problem

Every DeFi protocol faces the same chicken-and-egg problem:

```
Traders need liquidity to trade
    ↓
LPs need traders to earn fees
    ↓
Neither comes without the other
```

This document addresses: **Who will provide the first liquidity, and why?**

---

## Potential LP Segments

### Tier 1: Most Likely (Target First)

#### 1. Yield-Seeking DeFi Natives

**Profile:**
- Already LPing on Solana (Orca, Raydium, Marinade, etc.)
- Comfortable with impermanent loss and smart contract risk
- Actively searching for higher yields
- Portfolio: $10K - $500K in DeFi

**Why They'd LP on Sigma:**
- Higher APY (15-40%) vs. lending (5-10%) or AMM LP (10-20%)
- Different risk profile (derivatives risk vs. IL)
- Diversification from existing positions

**How to Attract:**
- Show backtested returns
- Compare risk/reward to alternatives they know
- Start with small caps, prove it works
- Community testimonials

**Realistic Contribution:** $1K - $50K per LP

---

#### 2. Sophisticated Traders (Trader-LPs)

**Profile:**
- Understand derivatives from TradFi or other platforms
- Already trade options/perps actively
- See LP as part of overall strategy
- Portfolio: $50K - $2M

**Why They'd LP on Sigma:**
- Understand the products deeply
- Can hedge LP risk with their own trades
- See inefficiencies they can exploit
- "Become the house" mentality

**How to Attract:**
- Technical documentation
- Transparent pool mechanics
- Real-time analytics
- Allow partial hedging strategies

**Realistic Contribution:** $10K - $200K per LP

---

#### 3. The Team / Founders

**Profile:**
- You and any co-founders/early team

**Why:**
- Prove skin in the game
- Bootstrap initial liquidity
- Show confidence in the product

**How Much:**
- Should commit meaningful personal capital
- Sets the tone for the community

**Realistic Contribution:** $10K - $100K+ (depends on personal situation)

---

### Tier 2: Likely with Incentives

#### 4. Yield Aggregators & Vaults

**Profile:**
- Protocols like Tulip, Francium, or new yield aggregators
- Automatically allocate to highest-yield opportunities
- Large capital pools ($1M+)

**Why They'd LP on Sigma:**
- Competitive risk-adjusted yields
- Diversification for their users
- New yield source

**Requirements:**
- Proven track record (need mainnet data)
- Audited contracts
- API/SDK for integration
- Minimum TVL threshold ($5M+)

**How to Attract:**
- Integration incentives
- Co-marketing
- Revenue sharing

**Realistic Contribution:** $500K - $5M per integration

**Timeline:** 3-6 months after mainnet (need track record first)

---

#### 5. Crypto Funds / Family Offices

**Profile:**
- Professional funds looking for yield on idle capital
- Treasury management for crypto-native companies
- Portfolio: $5M - $100M+

**Why They'd LP on Sigma:**
- Higher yield than staking or lending
- Derivatives exposure without active trading
- Portfolio diversification

**Requirements:**
- Audit from reputable firm
- Insurance or coverage options
- Institutional-grade documentation
- Legal clarity

**How to Attract:**
- Direct outreach
- Fund-specific terms (larger minimums, lower fees)
- White-glove onboarding
- Regular reporting

**Realistic Contribution:** $100K - $2M per fund

**Timeline:** 6-12 months (need credibility first)

---

#### 6. DAOs with Treasury

**Profile:**
- Protocol treasuries with idle capital
- Examples: Marinade, Jupiter, Jito, Mango
- Treasury size: $10M - $500M

**Why They'd LP on Sigma:**
- Productive use of treasury
- Ecosystem alignment (Solana native)
- Better yields than stables sitting idle

**Requirements:**
- Governance proposal process
- Risk assessment
- Alignment with DAO mission

**How to Attract:**
- Partnership discussions
- Custom terms
- Governance participation
- Revenue sharing

**Realistic Contribution:** $500K - $10M per DAO

**Timeline:** 6-12 months (governance takes time)

---

### Tier 3: Requires Token/Heavy Incentives

#### 7. Mercenary Capital

**Profile:**
- LP wherever incentives are highest
- Will leave when incentives dry up
- Large capital, no loyalty

**Why They'd LP on Sigma:**
- Token incentives
- Boosted yields
- Airdrops

**Considerations:**
- Not sustainable long-term
- Need to convert to "sticky" LPs
- Expensive (dilutes token holders)

**Realistic Contribution:** Depends entirely on incentive budget

---

## The Honest Truth

### Who Will NOT LP (At First)

| Segment | Why Not |
|---------|---------|
| Retail newbies | Don't understand derivatives risk |
| Risk-averse investors | Too complex, prefer lending |
| Most institutions | Need audit, track record, legal clarity |
| Yield aggregators | Need proven product first |

### Who WILL LP (Realistically)

| Segment | When | How Much |
|---------|------|----------|
| Founders/Team | Day 1 | $10K - $100K |
| DeFi natives (small) | Week 1-4 | $50K - $200K total |
| Sophisticated traders | Month 1-2 | $100K - $500K total |
| Early believers | Month 1-3 | $200K - $1M total |

**Realistic Day 1 TVL:** $50K - $200K
**Realistic Month 1 TVL:** $200K - $500K
**Realistic Month 3 TVL:** $500K - $2M

---

## Bootstrapping Strategies

### Strategy 1: Founder-Led Liquidity

**Approach:**
- Team provides initial liquidity
- Shows confidence
- Proves product works

**Pros:**
- No dilution
- Full control
- Proves skin in game

**Cons:**
- Limited by personal capital
- Concentrated risk

**Recommended:** $20K - $100K from team

---

### Strategy 2: Early LP Program

**Approach:**
- Whitelist 50-100 early LPs
- Higher fee share for first 3 months
- Exclusive access/benefits

**Example Terms:**
```
First $1M in TVL:
- 90% of fees to LPs (vs. 80% standard)
- Early LP badge/role
- Governance weight bonus
- Potential future token allocation
```

**Pros:**
- Attracts committed capital
- Builds community
- No immediate token needed

**Cons:**
- Lower protocol revenue early
- Need to find qualified LPs

---

### Strategy 3: LP Mining (Token Incentives)

**Approach:**
- Distribute tokens to LPs
- Higher rewards early, decreasing over time

**Example:**
```
Month 1: 10% APY in tokens + trading fees
Month 2: 8% APY in tokens + trading fees
Month 3: 6% APY in tokens + trading fees
...decreasing to 0% by month 12
```

**Pros:**
- Can attract large capital quickly
- Standard DeFi playbook

**Cons:**
- Need token (legal complexity)
- Mercenary capital
- Dilution

**Recommended:** Only if other strategies fail

---

### Strategy 4: Strategic Partnerships

**Approach:**
- Partner with established protocols
- They provide liquidity, you provide utility

**Example Partners:**
| Partner | What They Provide | What They Get |
|---------|------------------|---------------|
| Drift | Funding rate data, users | FundingSwap integration |
| Jupiter | Distribution, users | Derivatives offering |
| Marinade | Treasury capital | Yield on mSOL |

**Pros:**
- Large capital
- Credibility boost
- User acquisition

**Cons:**
- Long negotiation
- May want equity/tokens
- Dependency

---

## Recommended Bootstrapping Plan

### Phase 1: Seed Liquidity (Day 1 - Week 4)

**Target TVL:** $100K - $300K

**Sources:**
1. Team capital: $50K
2. Friends & advisors: $50K
3. Early Discord community: $100K

**Actions:**
- Commit team funds publicly
- Recruit 20-30 "founding LPs" from community
- Offer enhanced fee share (90/10)
- Weekly transparency reports

---

### Phase 2: Community Growth (Month 1-3)

**Target TVL:** $300K - $1M

**Sources:**
1. Expand early LP program
2. Trading competition winners become LPs
3. Referral program (LPs recruit LPs)

**Actions:**
- LP leaderboard with rewards
- Educational content on LP returns
- Case studies of successful LPs
- Introduce more pools as liquidity grows

---

### Phase 3: Scale (Month 3-6)

**Target TVL:** $1M - $5M

**Sources:**
1. Yield aggregator integrations
2. First institutional LPs
3. DAO treasury proposals

**Actions:**
- Complete security audit
- Pursue aggregator integrations
- Direct outreach to funds
- Submit DAO governance proposals

---

### Phase 4: Maturity (Month 6+)

**Target TVL:** $5M+

**Sources:**
1. Organic growth from reputation
2. Multiple aggregator integrations
3. Institutional capital

**Actions:**
- Reduce incentives as organic volume grows
- Expand to more assets
- Consider token launch if needed

---

## LP Incentive Economics

### Without Token

| TVL | Trading Volume | Fees (0.1%) | LP APY |
|-----|---------------|-------------|--------|
| $100K | $1M/month | $1,000 | 12% |
| $500K | $5M/month | $5,000 | 12% |
| $1M | $15M/month | $15,000 | 18% |
| $5M | $100M/month | $100,000 | 24% |

**Key Insight:** Need ~15x monthly volume to TVL ratio for attractive APY

### With Token Incentives

| TVL | Fee APY | Token APY | Total APY |
|-----|---------|-----------|-----------|
| $100K | 5% | 20% | 25% |
| $500K | 8% | 15% | 23% |
| $1M | 12% | 10% | 22% |
| $5M | 18% | 5% | 23% |

**Key Insight:** Tokens can bridge the gap until organic volume builds

---

## Risk Disclosure for LPs

Must be transparent about risks:

1. **Smart Contract Risk** - Bugs could lose funds
2. **Derivatives Risk** - LPs take opposite side of trades
3. **Liquidity Risk** - May not be able to withdraw instantly
4. **Oracle Risk** - Bad price data could cause losses
5. **Regulatory Risk** - Legal status uncertain

**Mitigation Messaging:**
- "Only LP what you can afford to lose"
- "Diversify across pools"
- "Understand the products before LPing"

---

## Key Questions to Answer

Before launching, be ready to answer:

1. **"What's my expected return?"**
   - Show backtested data
   - Be honest about variance

2. **"What's my worst case?"**
   - Maximum loss is deposit
   - Show historical drawdowns

3. **"How is this different from other LP opportunities?"**
   - Different risk profile
   - Uncorrelated to AMM IL

4. **"When can I withdraw?"**
   - Explain utilization limits
   - Be transparent about constraints

5. **"Who else is LPing?"**
   - Show team commitment
   - Share aggregate stats (not individual)

---

## Summary: Who Will LP?

### Definitely (Target These)
- Founders/team (lead by example)
- DeFi-native yield seekers
- Sophisticated traders who understand derivatives

### Probably (With Effort)
- Early community members
- Small funds looking for alpha
- Other protocol teams (strategic)

### Eventually (Need Track Record)
- Yield aggregators
- DAOs with treasury
- Larger institutions

### Unlikely (Don't Count On)
- Retail who doesn't understand derivatives
- Risk-averse capital
- Anyone requiring audit before launch

---

## Action Items

1. **Commit your own capital** - Decide how much you'll LP personally
2. **Build early LP list** - Start recruiting from Discord/Twitter
3. **Create LP-specific content** - Explain risk/reward clearly
4. **Design early LP program** - Terms for first $1M
5. **Identify strategic partners** - Who would benefit from providing liquidity?
6. **Prepare transparency tools** - Real-time APY, pool stats, etc.
