# @sigma-protocol/sdk

TypeScript SDK for Sigma Protocol - DeFi derivatives on Solana.

## Installation

```bash
npm install @sigma-protocol/sdk
# or
yarn add @sigma-protocol/sdk
```

## Quick Start

```typescript
import { SigmaClient } from "@sigma-protocol/sdk";
import { AnchorProvider } from "@coral-xyz/anchor";

// Create provider with your wallet
const provider = AnchorProvider.env();

// Initialize client
const sigma = new SigmaClient(provider);

// Or use convenience constructors
const devnetClient = SigmaClient.devnet(wallet);
const mainnetClient = SigmaClient.mainnet(wallet);
```

## Features

### Oracle Client

Access price feeds, funding rates, variance tracking, and more:

```typescript
// Get latest price
const price = await sigma.oracle.getLatestPrice(SOL_MINT);

// Get funding rate
const fundingFeed = await sigma.oracle.getFundingFeed("SOL-PERP");

// Get variance data
const variance = await sigma.oracle.getVarianceTracker(priceFeed);

// Get volatility index (SVI)
const svi = await sigma.oracle.getVolatilityIndex("SIGMA-VOL");
```

### Volswap Client

Trade variance swaps:

```typescript
// Open a long variance position (profit when realized vol > strike)
await sigma.volswap.openLong(
  underlyingMint,
  collateralMint,
  userCollateral,
  notional,
  maxPremium
);

// Open a short variance position
await sigma.volswap.openShort(
  underlyingMint,
  collateralMint,
  userCollateral,
  notional,
  minPremium
);

// Provide liquidity
await sigma.volswap.depositLiquidity(underlyingMint, userCollateral, amount);
```

### Funding Swap Client

Trade funding rate derivatives:

```typescript
// Receive fixed rate (hedge against falling funding)
await sigma.fundingSwap.openReceiveFixed(
  "SOL-PERP",
  collateralMint,
  userCollateral,
  notional,
  fixedRateBps,
  swapId
);

// Pay fixed rate (profit from high funding)
await sigma.fundingSwap.openPayFixed(
  "SOL-PERP",
  collateralMint,
  userCollateral,
  notional,
  fixedRateBps,
  swapId
);
```

### Exotic Vault Client

Trade exotic options:

```typescript
// Buy an Asian call option (TWAP-settled)
await sigma.exoticVault.buyAsianCall(
  underlyingMint,
  collateralMint,
  userCollateral,
  strikePrice,
  notional,
  durationDays
);

// Buy a knock-out barrier option
await sigma.exoticVault.buyKnockout(
  underlyingMint,
  collateralMint,
  userCollateral,
  strikePrice,
  barrierPrice,
  notional,
  durationDays,
  isCall,
  isUpBarrier
);
```

## PDA Utilities

The SDK provides utility functions for deriving Program Derived Addresses:

```typescript
import {
  findPriceFeedPDA,
  findVariancePoolPDA,
  findFundingPoolPDA,
  findExoticVaultPDA,
} from "@sigma-protocol/sdk";

const [priceFeed, bump] = findPriceFeedPDA(assetMint);
const [pool] = findVariancePoolPDA(underlyingMint);
```

## Types

All account types are exported for TypeScript users:

```typescript
import type {
  PriceFeed,
  VariancePool,
  VariancePosition,
  FundingPool,
  FundingSwapPosition,
  ExoticVault,
  ExoticOption,
} from "@sigma-protocol/sdk";
```

## Program IDs

```typescript
import { PROGRAM_IDS } from "@sigma-protocol/sdk";

console.log(PROGRAM_IDS.SHARED_ORACLE);  // DyPhNbm845yWMuAmBLmsLANxm7wDJLDwoQNR2n8n8kM1
console.log(PROGRAM_IDS.VOLSWAP);        // HkmNK58gA3ho7iorsAbHXfTHHLYJ6jenKcZDPDjNknAQ
console.log(PROGRAM_IDS.FUNDING_SWAP);   // BBnksXi8bg3Z87qdu4neD5LeSY2dgreiABPCeYpvR77u
console.log(PROGRAM_IDS.EXOTIC_VAULT);   // 36pKgauHLWvZDgEs8czCPvyLy8i5mZTD1QXuuCpvcqDV
```

## License

MIT
