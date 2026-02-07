# Private Intents

Private Intents enable encrypted order submission for Sigma derivatives, providing privacy-preserving execution and cross-chain collateral support.

## Overview

Traditional on-chain order submission exposes order parameters to the public mempool, enabling front-running and MEV extraction. Private Intents solve this by:

1. **Encrypting order parameters** before submission
2. **Using a trusted solver** to decrypt and execute orders
3. **Supporting cross-chain collateral** via Wormhole and Circle CCTP

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Private Intent Flow                          │
└─────────────────────────────────────────────────────────────────────┘

   User                    On-Chain                    Solver
    │                         │                          │
    │  1. Encrypt order       │                          │
    │     parameters          │                          │
    │                         │                          │
    │  2. Submit intent ─────▶│                          │
    │     + collateral        │  3. Store encrypted      │
    │                         │     payload + collateral │
    │                         │                          │
    │                         │  4. Poll pending ◀───────│
    │                         │     intents              │
    │                         │                          │
    │                         │  5. Decrypt payload      │
    │                         │                          │
    │                         │  6. Execute via CPI ◀────│
    │                         │     to VolSwap/etc       │
    │                         │                          │
    │  7. Claim result ──────▶│                          │
    │                         │                          │
```

## Encryption

Private Intents use NaCl box encryption (X25519-XSalsa20-Poly1305):

- **Key Exchange**: X25519 elliptic curve Diffie-Hellman
- **Encryption**: XSalsa20 stream cipher
- **Authentication**: Poly1305 MAC

### Key Derivation

Users derive their encryption keypair deterministically from their wallet:

```typescript
import { deriveEncryptionKeypair } from "@sigma-protocol/private-intents";

// Derive X25519 keypair from wallet secret (first 32 bytes)
const encryptionKeypair = deriveEncryptionKeypair(walletSecret);

console.log("Public key:", Buffer.from(encryptionKeypair.publicKey).toString("hex"));
```

### Encryption Flow

1. User derives encryption keypair from wallet
2. User fetches solver's public encryption key
3. User encrypts order parameters with solver's public key
4. Encrypted payload (nonce + ciphertext) is submitted on-chain
5. Only the solver can decrypt using its private key

## Intent Types

Private Intents support all three Sigma derivative types:

### Variance Swap Intent

```typescript
interface VarianceSwapIntent {
  notional: BN;           // Position size
  premiumLimit: BN;       // Max/min premium
  strikeVarianceBps: BN;  // Strike variance (basis points)
  deadline: number;       // Unix timestamp
  slippageBps: number;    // Slippage tolerance
  isLong: boolean;        // Long or short variance
}
```

**Payload size**: 40 bytes (80 bytes encrypted)

### Funding Swap Intent

```typescript
interface FundingSwapIntent {
  notional: BN;           // Position size
  durationPeriods: number; // Funding periods
  fixedRateLimitBps: number; // Fixed rate limit
  deadline: number;       // Unix timestamp
  slippageBps: number;    // Slippage tolerance
  isReceiver: boolean;    // Receive or pay fixed
}
```

**Payload size**: 26 bytes (66 bytes encrypted)

### Exotic Option Intent

```typescript
interface ExoticOptionIntent {
  notional: BN;           // Position size
  strikePrice: BN;        // Strike price
  barrierPrice: BN;       // Barrier price (for barrier options)
  durationDays: number;   // Option duration
  deadline: number;       // Unix timestamp
  slippageBps: number;    // Slippage tolerance
  optionType: number;     // Asian, barrier, etc.
}
```

**Payload size**: 42 bytes (82 bytes encrypted)

## Cross-Chain Collateral

Private Intents support collateral from other chains via:

### Wormhole Bridge

Bridge collateral from Ethereum or Arbitrum:

```typescript
import { WormholeClient } from "@sigma-protocol/private-intents";

const wormhole = new WormholeClient({
  network: "mainnet",
  solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  guardianRpcUrl: "https://wormhole-guardian.example.com",
});

// Bridge USDC from Ethereum
const result = await wormhole.bridgeToSolana(
  "ethereum",
  ETHEREUM_USDC,
  amount,
  recipientAddress
);

// Submit intent with bridged collateral
await privateClient.submitCrossChainIntent({
  // ... intent params
  sourceChain: CollateralSource.Ethereum,
  vaaHash: result.vaaHash,
});
```

### Circle CCTP

For native USDC, use Circle's Cross-Chain Transfer Protocol:

```typescript
// Bridge native USDC (no wrapped tokens)
const result = await wormhole.bridgeWithCctp(
  "ethereum",
  amount,
  recipientAddress
);
```

### Supported Chains

| Chain | Bridge | Native USDC |
|-------|--------|-------------|
| Ethereum | Wormhole | CCTP |
| Arbitrum | Wormhole | CCTP |

## Solver Service

The solver is a trusted service that:

1. Polls for pending intents every 5 seconds
2. Decrypts intent payloads using its private key
3. Validates parameters (deadline, slippage, etc.)
4. Executes orders via CPI to target programs
5. Updates intent status on-chain

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/solver-pubkey` | GET | Get solver's encryption public key |
| `/api/register-encryption-pubkey` | POST | Register user's encryption public key |
| `/api/health` | GET | Health check |

### Running the Solver

```bash
cd solver

# Configure environment
cp .env.example .env
# Edit .env with solver keypair and RPC URL

# Start the solver
yarn dev
```

## On-Chain State

### EncryptedIntent Account

```rust
pub struct EncryptedIntent {
    pub owner: Pubkey,                  // Intent owner
    pub intent_id: u64,                 // Unique ID per owner
    pub intent_type: IntentType,        // VarianceSwap, FundingSwap, ExoticOption
    pub target_pool: Pubkey,            // Target pool/vault
    pub collateral_mint: Pubkey,        // Collateral token
    pub collateral_amount: u64,         // Deposited collateral
    pub collateral_source: CollateralSource, // Native or bridged
    pub vaa_hash: Vec<u8>,              // Wormhole VAA hash (if bridged)
    pub encrypted_payload: Vec<u8>,     // Encrypted order parameters
    pub user_encryption_pubkey: Vec<u8>, // User's X25519 public key
    pub status: IntentStatus,           // Pending, Executing, Completed, etc.
    pub created_at: i64,                // Creation timestamp
    pub executed_at: i64,               // Execution timestamp
    pub executed_by: Option<Pubkey>,    // Solver who executed
    pub result_position: Option<Pubkey>, // Resulting position account
    pub bump: u8,                       // PDA bump
}
```

### IntentStatus

| Status | Description |
|--------|-------------|
| `Pending` | Waiting for solver execution |
| `Executing` | Solver is currently executing |
| `Completed` | Successfully executed |
| `Cancelled` | Cancelled by owner |
| `Failed` | Execution failed |
| `BridgePending` | Waiting for cross-chain bridge |

## Usage Example

```typescript
import { PrivateIntentClient } from "@sigma-protocol/private-intents";
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";

// Setup
const connection = new Connection("https://api.devnet.solana.com");
const wallet = new Wallet(Keypair.fromSecretKey(/* ... */));

// Create client
const client = new PrivateIntentClient(connection, wallet);

// Initialize encryption
client.initializeEncryption(wallet.payer.secretKey);

// Register with solver
await client.registerWithSolver("https://solver.sigma.fi");

// Submit private variance swap
const result = await client.submitPrivateVarianceSwap({
  targetPool: variancePoolPubkey,
  collateralMint: usdcMint,
  notional: new BN(10_000_000_000), // 10,000 USDC
  premiumLimit: new BN(500_000_000), // 500 USDC max premium
  strikeVarianceBps: new BN(3500),   // 35% strike variance
  deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  slippageBps: 100,                  // 1% slippage
  isLong: true,
});

console.log("Intent ID:", result.intentId.toString());
console.log("Intent PDA:", result.intentPubkey.toBase58());

// Check status
const status = await client.getIntentStatus(result.intentId);
console.log("Status:", status);

// Cancel if needed
if (status === IntentStatus.Pending) {
  await client.cancelIntent(result.intentId);
}
```

## Security Considerations

### Trust Model

The current implementation uses a **single trusted solver** model:

- The solver has access to decrypted order parameters
- The solver is trusted not to front-run or manipulate orders
- The solver operates like a traditional broker

### Future: Threshold Decryption

For large orders (>$100k), we plan to implement M-of-N threshold decryption:

- Order parameters are encrypted to N solver committee members
- M members must collaborate to decrypt
- Prevents single-point-of-trust for large trades

### On-Chain Guarantees

Even with a trusted solver, the following are enforced on-chain:

- **Deadline**: Orders expire if not executed by deadline
- **Slippage**: Maximum slippage is enforced during execution
- **Collateral**: Collateral is locked in PDA until execution/cancellation
- **Owner-only cancellation**: Only the owner can cancel pending intents

## Program ID

| Network | Address |
|---------|---------|
| Localnet | `AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow` |
| Devnet | `AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow` |

## Instructions

| Instruction | Description | Signer |
|-------------|-------------|--------|
| `initialize_solver` | Set up solver configuration | Authority |
| `submit_intent` | Submit encrypted intent with native collateral | Owner |
| `submit_cross_chain_intent` | Submit with bridged collateral | Owner |
| `execute_intent` | Execute pending intent | Solver |
| `cancel_intent` | Cancel and reclaim collateral | Owner |
| `claim_result` | Claim execution result | Owner |

## Related Documentation

- [VolSwap](./02-volswap.md) - Variance swaps
- [FundingSwap](./03-funding-swap.md) - Funding rate derivatives
- [ExoticVault](./04-exotic-vault.md) - Exotic options
