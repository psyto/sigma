# @sigma-protocol/private-intents

TypeScript library for submitting encrypted derivative orders to Sigma Protocol.

## Installation

```bash
npm install @sigma-protocol/private-intents
# or
yarn add @sigma-protocol/private-intents
```

## Features

- **Encryption**: NaCl box encryption (X25519-XSalsa20-Poly1305)
- **Intent Schemas**: Serialization for variance swaps, funding swaps, and exotic options
- **Cross-Chain**: Wormhole and Circle CCTP integration for bridged collateral
- **Client SDK**: High-level API for intent submission and management

## Quick Start

```typescript
import { PrivateIntentClient } from "@sigma-protocol/private-intents";
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { BN } from "bn.js";

// Setup connection and wallet
const connection = new Connection("https://api.devnet.solana.com");
const wallet = new Wallet(Keypair.fromSecretKey(/* your secret key */));

// Create client
const client = new PrivateIntentClient(connection, wallet);

// Initialize encryption from wallet secret
client.initializeEncryption(wallet.payer.secretKey);

// Register with solver to exchange encryption keys
await client.registerWithSolver("https://solver.sigma.fi");

// Submit encrypted variance swap
const result = await client.submitPrivateVarianceSwap({
  targetPool: poolPubkey,
  collateralMint: usdcMint,
  notional: new BN(10_000_000_000),    // 10,000 USDC
  premiumLimit: new BN(500_000_000),   // 500 USDC max
  strikeVarianceBps: new BN(3500),     // 35%
  deadline: Math.floor(Date.now() / 1000) + 3600,
  slippageBps: 100,
  isLong: true,
});

console.log("Intent submitted:", result.intentPubkey.toBase58());
```

## Encryption

### Derive Encryption Keypair

```typescript
import { deriveEncryptionKeypair, generateEncryptionKeypair } from "@sigma-protocol/private-intents";

// Deterministic derivation from wallet secret
const keypair = deriveEncryptionKeypair(walletSecret);

// Or generate a random keypair
const randomKeypair = generateEncryptionKeypair();
```

### Encrypt/Decrypt Data

```typescript
import { encrypt, decrypt } from "@sigma-protocol/private-intents";

// Encrypt data for recipient
const encrypted = encrypt(plaintext, recipientPublicKey, senderKeypair);

// Decrypt received data
const decrypted = decrypt(encrypted.bytes, senderPublicKey, recipientKeypair);
```

## Intent Schemas

### Variance Swap

```typescript
import {
  serializeVarianceSwapIntent,
  deserializeVarianceSwapIntent,
  validateVarianceSwapIntent,
  VarianceSwapIntent,
} from "@sigma-protocol/private-intents";

const intent: VarianceSwapIntent = {
  notional: new BN(10_000_000_000),
  premiumLimit: new BN(500_000_000),
  strikeVarianceBps: new BN(3500),
  deadline: Math.floor(Date.now() / 1000) + 3600,
  slippageBps: 100,
  isLong: true,
};

// Validate
validateVarianceSwapIntent(intent);

// Serialize to bytes
const bytes = serializeVarianceSwapIntent(intent);

// Deserialize back
const decoded = deserializeVarianceSwapIntent(bytes);
```

### Funding Swap

```typescript
import {
  serializeFundingSwapIntent,
  FundingSwapIntent,
} from "@sigma-protocol/private-intents";

const intent: FundingSwapIntent = {
  notional: new BN(50_000_000_000),
  durationPeriods: 30,
  fixedRateLimitBps: 40,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  slippageBps: 50,
  isReceiver: true,
};

const bytes = serializeFundingSwapIntent(intent);
```

### Exotic Option

```typescript
import {
  serializeExoticOptionIntent,
  ExoticOptionIntent,
  ExoticOptionType,
} from "@sigma-protocol/private-intents";

const intent: ExoticOptionIntent = {
  notional: new BN(5_000_000_000),
  strikePrice: new BN(150_000_000),
  barrierPrice: new BN(180_000_000),
  durationDays: 30,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  slippageBps: 100,
  optionType: ExoticOptionType.UpAndOutCall,
};

const bytes = serializeExoticOptionIntent(intent);
```

## Cross-Chain Collateral

### Bridge from Ethereum

```typescript
import { WormholeClient, CollateralSource } from "@sigma-protocol/private-intents";

const wormhole = new WormholeClient({
  network: "mainnet",
  solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  guardianRpcUrl: "https://wormhole-guardian.example.com",
});

// Get quote for bridging
const quote = await wormhole.getQuote("ethereum", amount);
console.log("Estimated fee:", quote.fee);

// Bridge USDC from Ethereum
const result = await wormhole.bridgeToSolana(
  "ethereum",
  ETHEREUM_USDC,
  amount,
  recipientAddress
);

// Wait for VAA
await wormhole.waitForVaa(result.sequence);
```

### Submit Cross-Chain Intent

```typescript
// After bridging, submit intent with VAA reference
await client.submitCrossChainIntent({
  targetPool: poolPubkey,
  collateralMint: usdcMint,
  notional: new BN(10_000_000_000),
  // ... other params
  sourceChain: CollateralSource.Ethereum,
  vaaHash: bridgeResult.vaaHash,
});
```

## Intent Management

### Check Status

```typescript
const status = await client.getIntentStatus(intentId);
// Returns: Pending | Executing | Completed | Cancelled | Failed
```

### Cancel Intent

```typescript
// Only pending or failed intents can be cancelled
await client.cancelIntent(intentId);
```

### List My Intents

```typescript
const myIntents = await client.getMyIntents();
for (const intent of myIntents) {
  console.log(`${intent.intentId}: ${intent.status}`);
}
```

## API Reference

### PrivateIntentClient

| Method | Description |
|--------|-------------|
| `initializeEncryption(secret)` | Initialize encryption keypair from wallet secret |
| `registerWithSolver(url)` | Register with solver and exchange encryption keys |
| `submitPrivateVarianceSwap(params)` | Submit encrypted variance swap |
| `submitPrivateFundingSwap(params)` | Submit encrypted funding swap |
| `submitPrivateExoticOption(params)` | Submit encrypted exotic option |
| `cancelIntent(intentId)` | Cancel pending intent |
| `getIntentStatus(intentId)` | Get intent status |
| `getMyIntents()` | List all intents for wallet |

### Types

```typescript
// Intent types
enum IntentType {
  VarianceSwap = 0,
  FundingSwap = 1,
  ExoticOption = 2,
}

// Intent status
enum IntentStatus {
  Pending = 0,
  Executing = 1,
  Completed = 2,
  Cancelled = 3,
  Failed = 4,
  BridgePending = 5,
}

// Collateral source
enum CollateralSource {
  Native = 0,
  Ethereum = 1,
  Arbitrum = 2,
  Cctp = 3,
}
```

## Program ID

```typescript
import { PRIVATE_INTENTS_PROGRAM_ID } from "@sigma-protocol/private-intents";

console.log(PRIVATE_INTENTS_PROGRAM_ID);
// AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow
```

## License

MIT
