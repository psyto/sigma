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
const localClient = SigmaClient.localnet(wallet);  // http://127.0.0.1:8899
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

// Get volatility index (SVI): keyed by its price feed and name
const svi = await sigma.oracle.getVolatilityIndex(priceFeed, "SVI-SOL-7D");
```

### Admin setup

Each program has an admin config PDA that must exist before any feed, pool or
vault is created. The program's **upgrade authority** creates it once; the key
it names becomes the admin. Feed, pool, vault and secondary-market inits must be
signed by that admin.

```typescript
// Signed by the program upgrade authority, once per program
await sigma.oracle.initializeOracleConfig(admin);   // PDA ["oracle_config"]
await sigma.volswap.initializeConfig(admin);        // PDA ["config"]
await sigma.fundingSwap.initializeConfig(admin);
await sigma.exoticVault.initializeConfig(admin);

// Two-step admin handover: the current admin proposes, the new admin accepts.
// Proposing PublicKey.default cancels a pending proposal.
await sigma.volswap.setAdmin(newAdmin);
await newAdminClient.volswap.acceptAdmin();
```

`findOracleConfigPDA`, `findVolswapConfigPDA`, `findFundingSwapConfigPDA` and
`findExoticVaultConfigPDA` return the config addresses.

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

// Close early / claim. The position address is derived from the wallet and the
// epoch unless you pass it (needed once the position has changed owner).
await sigma.volswap.claimPayout(underlyingMint, collateralMint, userCollateral, epoch, position);
```

### Funding Swap Client

Trade funding rate derivatives:

```typescript
// Payer: receive fixed, pay floating (hedge against falling funding).
// Fails if the pool's fixed rate is below minFixedRateBps.
await sigma.fundingSwap.openPayer(
  "SOL-PERP",
  collateralMint,
  userCollateral,
  notional,          // BN
  durationPeriods,   // number of funding periods
  minFixedRateBps
);

// Receiver: pay fixed, receive floating (profit from high funding).
// Fails if the pool's fixed rate is above maxFixedRateBps.
await sigma.fundingSwap.openReceiver(
  "SOL-PERP",
  collateralMint,
  userCollateral,
  notional,
  durationPeriods,
  maxFixedRateBps
);

// The swap's expiry is stored at open (open time + durationPeriods x the
// pool's funding period); settleSwap works from then on.

// The pool authority processes each funding period once it is due
await sigma.fundingSwap.processFundingPeriod("SOL-PERP");

// settleSwap / claimPayout / closeSwapEarly take an optional swap address
await sigma.fundingSwap.settleSwap("SOL-PERP", swapId, swap);
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

`settleOption` and `claimPayout` also take an optional option address as their last argument.

### Secondary Market

Positions are traded through a position token held by the shared oracle program.
Tokenizing moves the position into custody of the position token PDA
(`["position_token", position]`); the token's holder is the only one who can
redeem it, and a position must be redeemed before its owner can claim the payout or close it early.

```typescript
// Wallet must own a live VolSwap / FundingSwap / ExoticVault position.
// Terms and expiry are read on-chain.
await sigma.oracle.tokenizePosition(position);

const [positionToken] = findPositionTokenPDA(position);
await sigma.oracle.listPosition(positionToken, price, minPrice, listingExpiry);

// Buyer pays the listing price (at most maxPrice) in the market's quote mint,
// from the wallet's associated token account; the market fee goes to the
// fee recipient
await buyerClient.oracle.buyPosition(positionToken, maxPrice);

// The current holder takes the position back (token must not be listed)
await buyerClient.oracle.redeemPosition(position);
```

### Private Intents Client

Submit encrypted derivative orders:

```typescript
import { PrivateIntentClient } from "@sigma-protocol/private-intents";

// Create client
const privateClient = new PrivateIntentClient(connection, wallet);

// Initialize encryption from wallet secret
privateClient.initializeEncryption(walletSecret);

// Register with solver
await privateClient.registerWithSolver("https://solver.sigma.fi");

// Submit encrypted variance swap
const result = await privateClient.submitPrivateVarianceSwap({
  targetPool: poolPubkey,
  collateralMint: usdcMint,
  notional: new BN(10000 * 1e6),
  premiumLimit: new BN(500 * 1e6),
  strikeVarianceBps: new BN(3500),
  deadline: Math.floor(Date.now() / 1000) + 3600,
  slippageBps: 100,
  isLong: true,
});

console.log(`Intent submitted: ${result.intentPubkey.toBase58()}`);
```

## PDA Utilities

The SDK provides utility functions for deriving Program Derived Addresses:

```typescript
import {
  findPriceFeedPDA,
  findVariancePoolPDA,
  findFundingPoolPDA,
  findExoticVaultPDA,
  findSecondaryMarketPDA,
  findPositionTokenPDA,
  findOracleConfigPDA,
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

console.log(PROGRAM_IDS.SHARED_ORACLE);    // 81SjyEmtwJUeqU9ZEfc7sm9evVpDuGwRSLrFQeCF4j5o
console.log(PROGRAM_IDS.VOLSWAP);          // FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS
console.log(PROGRAM_IDS.FUNDING_SWAP);     // GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx
console.log(PROGRAM_IDS.EXOTIC_VAULT);     // 6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P
console.log(PROGRAM_IDS.PRIVATE_INTENTS);  // AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow
```

## License

MIT
