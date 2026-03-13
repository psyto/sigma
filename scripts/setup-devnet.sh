#!/usr/bin/env bash
# =============================================================================
# Sigma Protocol - Devnet State Initialization
# =============================================================================
# Initializes on-chain state after deploying programs to devnet.
# Creates oracle feeds, pools, vaults, and solver configuration.
#
# Prerequisites:
#   - Programs deployed to devnet (run deploy-devnet.sh first)
#   - Solana CLI configured for devnet
#   - Wallet with sufficient SOL balance
#
# Usage: bash scripts/setup-devnet.sh
# =============================================================================

set -euo pipefail

echo "============================================="
echo "  Sigma Protocol - Devnet State Setup"
echo "============================================="
echo ""

# ---------------------------------------------------------------------------
# Verify cluster configuration
# ---------------------------------------------------------------------------
CURRENT_CLUSTER=$(solana config get | grep 'RPC URL' | awk '{print $3}')
echo "Current cluster: $CURRENT_CLUSTER"

if [[ "$CURRENT_CLUSTER" != *"devnet"* ]]; then
  echo "WARNING: Solana CLI is not pointing to devnet."
  echo "Setting to devnet..."
  solana config set --url devnet
fi

WALLET=$(solana address)
echo "Wallet: $WALLET"
echo ""

# ---------------------------------------------------------------------------
# Program IDs (from Anchor.toml [programs.devnet])
# ---------------------------------------------------------------------------
SHARED_ORACLE=$(grep -A5 '\[programs.devnet\]' Anchor.toml | grep 'shared_oracle' | awk -F'"' '{print $2}')
VOLSWAP=$(grep -A5 '\[programs.devnet\]' Anchor.toml | grep 'volswap' | awk -F'"' '{print $2}')
FUNDING_SWAP=$(grep -A5 '\[programs.devnet\]' Anchor.toml | grep 'funding_swap' | awk -F'"' '{print $2}')
EXOTIC_VAULT=$(grep -A5 '\[programs.devnet\]' Anchor.toml | grep 'exotic_vault' | awk -F'"' '{print $2}')
PRIVATE_INTENTS=$(grep -A5 '\[programs.devnet\]' Anchor.toml | grep 'private_intents' | awk -F'"' '{print $2}')

echo "Program IDs:"
echo "  shared_oracle:    $SHARED_ORACLE"
echo "  volswap:          $VOLSWAP"
echo "  funding_swap:     $FUNDING_SWAP"
echo "  exotic_vault:     $EXOTIC_VAULT"
echo "  private_intents:  $PRIVATE_INTENTS"
echo ""

# ---------------------------------------------------------------------------
# Token Mints
# ---------------------------------------------------------------------------
SOL_MINT="So11111111111111111111111111111111111111112"
# On devnet we use the standard devnet USDC mint
USDC_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

echo "Token Mints:"
echo "  SOL:  $SOL_MINT"
echo "  USDC: $USDC_MINT (devnet)"
echo ""

# ---------------------------------------------------------------------------
# 1. Create shared-oracle SOL price feed
# ---------------------------------------------------------------------------
echo "[1/5] Creating shared-oracle SOL price feed..."
echo "  Program: $SHARED_ORACLE"
echo "  Asset:   SOL ($SOL_MINT)"
echo "  Interval: 60 seconds"
echo "  Max samples: 100"
echo ""
echo "  Command: anchor run init-oracle --provider.cluster devnet"
echo "  (Calling initializePriceFeed with asset_symbol='SOL', sample_interval=60, max_samples=100)"
echo ""

npx ts-node -e "
const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram } = require('@solana/web3.js');

async function run() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(require('fs').readFileSync('target/idl/shared_oracle.json', 'utf8'));
  const program = new anchor.Program(idl, provider);

  const SOL_MINT = new PublicKey('$SOL_MINT');
  const [priceFeed] = PublicKey.findProgramAddressSync(
    [Buffer.from('price_feed'), SOL_MINT.toBuffer()],
    program.programId
  );
  const [sampleBuffer] = PublicKey.findProgramAddressSync(
    [Buffer.from('sample_buffer'), priceFeed.toBuffer()],
    program.programId
  );

  try {
    const existing = await provider.connection.getAccountInfo(priceFeed);
    if (existing) {
      console.log('  [OK] SOL price feed already exists');
      return;
    }
    await program.methods
      .initializePriceFeed('SOL', new anchor.BN(60), 100)
      .accounts({
        authority: provider.wallet.publicKey,
        assetMint: SOL_MINT,
        priceFeed,
        sampleBuffer,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('  [OK] SOL price feed initialized');
  } catch (e) {
    console.log('  [ERR] ' + (e.message || e).toString().slice(0, 120));
  }
}
run();
" 2>&1 || echo "  [SKIP] Failed - ensure programs are deployed and IDLs are built"
echo ""

# ---------------------------------------------------------------------------
# 2. Initialize VolSwap pool
# ---------------------------------------------------------------------------
echo "[2/5] Initializing VolSwap pool (SOL variance swaps)..."
echo "  Program: $VOLSWAP"
echo "  Underlying: SOL"
echo "  Collateral: USDC"
echo "  Epoch: 7 days, Strike variance: 35%, Fee: 0.5%"
echo ""

npx ts-node -e "
const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

async function run() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const oracleIdl = JSON.parse(require('fs').readFileSync('target/idl/shared_oracle.json', 'utf8'));
  const idl = JSON.parse(require('fs').readFileSync('target/idl/volswap.json', 'utf8'));
  const oracleProgram = new anchor.Program(oracleIdl, provider);
  const program = new anchor.Program(idl, provider);

  const SOL_MINT = new PublicKey('$SOL_MINT');
  const USDC_MINT = new PublicKey('$USDC_MINT');

  const [priceFeed] = PublicKey.findProgramAddressSync(
    [Buffer.from('price_feed'), SOL_MINT.toBuffer()],
    oracleProgram.programId
  );
  const [varianceTracker] = PublicKey.findProgramAddressSync(
    [Buffer.from('variance_tracker'), priceFeed.toBuffer()],
    oracleProgram.programId
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from('variance_pool'), SOL_MINT.toBuffer()],
    program.programId
  );
  const [poolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_vault'), pool.toBuffer()],
    program.programId
  );

  try {
    const existing = await provider.connection.getAccountInfo(pool);
    if (existing) {
      console.log('  [OK] SOL VolSwap pool already exists');
      return;
    }
    const params = {
      epochDurationSeconds: new anchor.BN(7 * 86400),
      minNotional: new anchor.BN(100 * 1e6),
      maxNotional: new anchor.BN(100000 * 1e6),
      feeRateBps: 50,
      initialStrikeVarianceBps: new anchor.BN(3500),
      varianceCapBps: new anchor.BN(20000),
      earlyExitPenaltyBps: 500,
    };
    await program.methods
      .initializePool(params)
      .accounts({
        authority: provider.wallet.publicKey,
        collateralMint: USDC_MINT,
        underlyingMint: SOL_MINT,
        priceFeed,
        varianceTracker,
        pool,
        poolVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('  [OK] SOL VolSwap pool initialized');
  } catch (e) {
    console.log('  [ERR] ' + (e.message || e).toString().slice(0, 120));
  }
}
run();
" 2>&1 || echo "  [SKIP] Failed - ensure programs are deployed and IDLs are built"
echo ""

# ---------------------------------------------------------------------------
# 3. Initialize FundingSwap pool
# ---------------------------------------------------------------------------
echo "[3/5] Initializing FundingSwap pool (SOL-PERP)..."
echo "  Program: $FUNDING_SWAP"
echo "  Market: SOL-PERP"
echo "  Collateral: USDC"
echo "  Funding period: 8 hours, Fee: 0.3%"
echo ""

npx ts-node -e "
const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

async function run() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const oracleIdl = JSON.parse(require('fs').readFileSync('target/idl/shared_oracle.json', 'utf8'));
  const idl = JSON.parse(require('fs').readFileSync('target/idl/funding_swap.json', 'utf8'));
  const oracleProgram = new anchor.Program(oracleIdl, provider);
  const program = new anchor.Program(idl, provider);

  const USDC_MINT = new PublicKey('$USDC_MINT');

  const [fundingFeed] = PublicKey.findProgramAddressSync(
    [Buffer.from('funding_feed'), Buffer.from('SOL-PERP')],
    oracleProgram.programId
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from('funding_pool'), Buffer.from('SOL-PERP')],
    program.programId
  );
  const [poolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_vault'), pool.toBuffer()],
    program.programId
  );

  try {
    const existing = await provider.connection.getAccountInfo(pool);
    if (existing) {
      console.log('  [OK] SOL-PERP FundingSwap pool already exists');
      return;
    }
    const params = {
      marketSymbol: 'SOL-PERP',
      fundingPeriodSeconds: new anchor.BN(28800),
      minNotional: new anchor.BN(100 * 1e6),
      maxNotional: new anchor.BN(500000 * 1e6),
      maxDurationPeriods: 270,
      feeRateBps: 30,
      initialFixedRateBps: 10,
      earlyExitPenaltyBps: 500,
    };
    await program.methods
      .initializePool(params)
      .accounts({
        authority: provider.wallet.publicKey,
        collateralMint: USDC_MINT,
        fundingFeed,
        pool,
        poolVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('  [OK] SOL-PERP FundingSwap pool initialized');
  } catch (e) {
    console.log('  [ERR] ' + (e.message || e).toString().slice(0, 120));
  }
}
run();
" 2>&1 || echo "  [SKIP] Failed - ensure programs are deployed and IDLs are built"
echo ""

# ---------------------------------------------------------------------------
# 4. Initialize ExoticVault
# ---------------------------------------------------------------------------
echo "[4/5] Initializing ExoticVault (SOL Asian & Barrier options)..."
echo "  Program: $EXOTIC_VAULT"
echo "  Underlying: SOL"
echo "  Collateral: USDC"
echo "  Duration: 1-30 days, Fee: 1%"
echo ""

npx ts-node -e "
const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

async function run() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const oracleIdl = JSON.parse(require('fs').readFileSync('target/idl/shared_oracle.json', 'utf8'));
  const idl = JSON.parse(require('fs').readFileSync('target/idl/exotic_vault.json', 'utf8'));
  const oracleProgram = new anchor.Program(oracleIdl, provider);
  const program = new anchor.Program(idl, provider);

  const SOL_MINT = new PublicKey('$SOL_MINT');
  const USDC_MINT = new PublicKey('$USDC_MINT');

  const [priceFeed] = PublicKey.findProgramAddressSync(
    [Buffer.from('price_feed'), SOL_MINT.toBuffer()],
    oracleProgram.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('exotic_vault'), SOL_MINT.toBuffer()],
    program.programId
  );
  const [vaultCollateral] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_collateral'), vault.toBuffer()],
    program.programId
  );

  try {
    const existing = await provider.connection.getAccountInfo(vault);
    if (existing) {
      console.log('  [OK] SOL ExoticVault already exists');
      return;
    }
    const params = {
      minNotional: new anchor.BN(50 * 1e6),
      maxNotional: new anchor.BN(50000 * 1e6),
      minDurationDays: 1,
      maxDurationDays: 30,
      feeRateBps: 100,
      sampleIntervalSeconds: new anchor.BN(3600),
    };
    await program.methods
      .initializeVault(params)
      .accounts({
        authority: provider.wallet.publicKey,
        collateralMint: USDC_MINT,
        underlyingMint: SOL_MINT,
        priceFeed,
        vault,
        vaultCollateral,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('  [OK] SOL ExoticVault initialized');
  } catch (e) {
    console.log('  [ERR] ' + (e.message || e).toString().slice(0, 120));
  }
}
run();
" 2>&1 || echo "  [SKIP] Failed - ensure programs are deployed and IDLs are built"
echo ""

# ---------------------------------------------------------------------------
# 5. Initialize Private Intents Solver
# ---------------------------------------------------------------------------
echo "[5/5] Initializing Private Intents solver..."
echo "  Program: $PRIVATE_INTENTS"
echo ""

npx ts-node -e "
const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram } = require('@solana/web3.js');

async function run() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(require('fs').readFileSync('target/idl/private_intents.json', 'utf8'));
  const program = new anchor.Program(idl, provider);

  const [solverState] = PublicKey.findProgramAddressSync(
    [Buffer.from('solver_state')],
    program.programId
  );

  try {
    const existing = await provider.connection.getAccountInfo(solverState);
    if (existing) {
      console.log('  [OK] Solver already initialized');
      return;
    }
    await program.methods
      .initializeSolver()
      .accounts({
        authority: provider.wallet.publicKey,
        solverState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('  [OK] Solver initialized');
  } catch (e) {
    console.log('  [ERR] ' + (e.message || e).toString().slice(0, 120));
  }
}
run();
" 2>&1 || echo "  [SKIP] Failed - ensure programs are deployed and IDLs are built"
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "============================================="
echo "  Devnet state initialization complete!"
echo ""
echo "  Initialized:"
echo "    - Shared Oracle: SOL price feed"
echo "    - VolSwap: SOL variance swap pool"
echo "    - FundingSwap: SOL-PERP funding rate pool"
echo "    - ExoticVault: SOL Asian & Barrier options vault"
echo "    - Private Intents: Solver state"
echo ""
echo "  Next steps:"
echo "    1. Start the oracle service: npm run oracle:dev"
echo "    2. Start the dashboard:     npm run dashboard:dev"
echo "    3. Export IDLs:             npm run export:idl"
echo "============================================="
