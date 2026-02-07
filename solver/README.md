# Sigma Private Intent Solver

Solver service for decrypting and executing private derivative orders on Sigma Protocol.

## Overview

The solver is a trusted service that:

1. Polls for pending encrypted intents on-chain
2. Decrypts order parameters using its private encryption key
3. Validates order parameters (deadline, slippage, etc.)
4. Executes orders via CPI to target Sigma programs
5. Updates intent status on-chain

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Solver Service                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  API Layer  │    │   Solver    │    │     Executors       │ │
│  │             │    │   Engine    │    │                     │ │
│  │ /solver-    │    │             │    │ ├─ VolSwap          │ │
│  │  pubkey     │───▶│ Poll Loop  │───▶│ ├─ FundingSwap      │ │
│  │             │    │ Decrypt    │    │ └─ ExoticVault      │ │
│  │ /register   │    │ Validate   │    │                     │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Encryption Registry                       ││
│  │         User Address → User Encryption Public Key            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd solver
yarn install
```

## Configuration

Create a `.env` file:

```bash
# Required
SOLVER_KEYPAIR_PATH=/path/to/solver-keypair.json
SOLANA_RPC_URL=https://api.devnet.solana.com

# Optional
PORT=3001
POLL_INTERVAL_MS=5000
LOG_LEVEL=info
```

### Generating Solver Keypair

```bash
# Generate a new keypair for the solver
solana-keygen new -o solver-keypair.json

# Get the public key
solana-keygen pubkey solver-keypair.json
```

### Initializing On-Chain Config

Before running the solver, initialize the solver configuration on-chain:

```bash
# Using Anchor CLI or a setup script
anchor run initialize-solver -- \
  --solver-pubkey $(solana-keygen pubkey solver-keypair.json) \
  --fee-bps 50 \
  --min-collateral 1000000
```

## Running

### Development

```bash
yarn dev
```

### Production

```bash
yarn build
yarn start
```

## API Endpoints

### GET /api/solver-pubkey

Returns the solver's encryption public key.

**Response:**
```json
{
  "encryptionPubkey": "a1b2c3d4e5f6...",
  "solanaAddress": "SoLvEr1111111111111111111111111111111111111"
}
```

### POST /api/register-encryption-pubkey

Register a user's encryption public key.

**Request:**
```json
{
  "userAddress": "User111111111111111111111111111111111111111",
  "encryptionPubkey": "f6e5d4c3b2a1..."
}
```

**Response:**
```json
{
  "success": true
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "pendingIntents": 5,
  "executedIntents": 150
}
```

## Solver Engine

### Poll Loop

The solver continuously polls for pending intents:

```typescript
// Every 5 seconds
while (running) {
  const pendingIntents = await getPendingIntents();

  for (const intent of pendingIntents) {
    try {
      await processIntent(intent);
    } catch (error) {
      console.error(`Failed to process intent ${intent.intentId}:`, error);
    }
  }

  await sleep(POLL_INTERVAL_MS);
}
```

### Intent Processing

For each pending intent:

1. **Fetch** user's encryption public key from registry
2. **Decrypt** the encrypted payload
3. **Validate** parameters:
   - Deadline not passed
   - Slippage within bounds
   - Collateral sufficient
4. **Execute** via CPI to target program
5. **Update** intent status to Completed/Failed

### Executors

Each Sigma program has a dedicated executor:

#### VolSwap Executor

```typescript
async executeVarianceSwap(intent, decryptedParams) {
  // Build CPI instruction to VolSwap program
  // - open_long or open_short based on isLong
  // - Transfer collateral from intent vault
  // - Create position account
}
```

#### FundingSwap Executor

```typescript
async executeFundingSwap(intent, decryptedParams) {
  // Build CPI instruction to FundingSwap program
  // - open_receive_fixed or open_pay_fixed
  // - Transfer collateral
  // - Create swap position
}
```

#### ExoticVault Executor

```typescript
async executeExoticOption(intent, decryptedParams) {
  // Build CPI instruction to ExoticVault program
  // - buy_asian_call, buy_knockout, etc.
  // - Transfer premium from collateral
  // - Create option position
}
```

## Security

### Trust Model

The solver is a **trusted party** that:
- Has access to decrypted order parameters
- Executes orders on behalf of users
- Operates similar to a traditional broker

### Protections

1. **On-chain validation**: Deadlines and slippage enforced on-chain
2. **Collateral locking**: Funds locked in PDA until execution
3. **Audit logging**: All operations logged for transparency
4. **Rate limiting**: API endpoints rate-limited to prevent abuse

### Future: Threshold Solver

For large orders, we plan M-of-N threshold decryption:
- Multiple solver nodes hold key shares
- M nodes must collaborate to decrypt
- Eliminates single point of trust

## Monitoring

### Metrics

The solver exposes Prometheus metrics:

```
# Pending intents
sigma_solver_pending_intents

# Executed intents
sigma_solver_executed_intents_total

# Failed intents
sigma_solver_failed_intents_total

# Processing time
sigma_solver_processing_time_seconds
```

### Logging

Logs are structured JSON for easy parsing:

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00Z",
  "message": "Intent executed",
  "intentId": "12345",
  "type": "VarianceSwap",
  "collateral": "10000000000",
  "executionTime": 1.5
}
```

## Development

### Project Structure

```
solver/
├── src/
│   ├── index.ts          # Entry point
│   ├── api.ts            # Express API routes
│   ├── solver.ts         # Solver engine
│   └── executors/
│       ├── index.ts
│       ├── volswap.ts
│       ├── funding.ts
│       └── exotic.ts
├── package.json
├── tsconfig.json
└── README.md
```

### Testing

```bash
# Run tests
yarn test

# Run with coverage
yarn test:coverage
```

### Local Development

1. Start local validator: `solana-test-validator`
2. Deploy programs: `anchor deploy`
3. Initialize solver config
4. Start solver: `yarn dev`
5. Submit test intent via client

## Troubleshooting

### Common Issues

**"Failed to decrypt payload"**
- User's encryption pubkey not registered
- Check if user called `registerWithSolver()`

**"Intent expired"**
- Deadline passed before execution
- Increase poll frequency or deadline

**"Insufficient collateral"**
- Collateral amount less than minimum
- Check `min_collateral` in solver config

**"CPI failed"**
- Target pool/vault not initialized
- Check remaining accounts for CPI

## License

MIT
