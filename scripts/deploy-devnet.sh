#!/usr/bin/env bash
# =============================================================================
# Sigma Protocol - Devnet Deployment Script
# =============================================================================
# Builds all programs and deploys them to Solana devnet.
#
# Usage: bash scripts/deploy-devnet.sh
# =============================================================================

set -euo pipefail

echo "============================================="
echo "  Sigma Protocol - Devnet Deployment"
echo "============================================="
echo ""

# ---------------------------------------------------------------------------
# 1. Configure Solana CLI for devnet
# ---------------------------------------------------------------------------
echo "[1/5] Setting Solana CLI to devnet..."
solana config set --url devnet
echo "  Cluster: $(solana config get | grep 'RPC URL' | awk '{print $3}')"
echo ""

# ---------------------------------------------------------------------------
# 2. Check wallet and balance
# ---------------------------------------------------------------------------
echo "[2/5] Checking wallet..."
WALLET=$(solana address)
echo "  Wallet address: $WALLET"

BALANCE=$(solana balance --lamports 2>/dev/null | awk '{print $1}')
BALANCE_SOL=$(echo "scale=4; $BALANCE / 1000000000" | bc 2>/dev/null || echo "unknown")
echo "  Balance: $BALANCE_SOL SOL"

# Warn if balance is below 5 SOL (deployments can be expensive)
MIN_BALANCE=5000000000
if [ "$BALANCE" -lt "$MIN_BALANCE" ] 2>/dev/null; then
  echo ""
  echo "  WARNING: Balance is low (< 5 SOL). Deployment may fail."
  echo "  Request an airdrop with: solana airdrop 2"
  echo "  Or visit: https://faucet.solana.com"
  echo ""
fi
echo ""

# ---------------------------------------------------------------------------
# 3. Build all programs
# ---------------------------------------------------------------------------
echo "[3/5] Building all programs with anchor build..."
anchor build
echo "  Build complete."
echo ""

# ---------------------------------------------------------------------------
# 4. Deploy to devnet
# ---------------------------------------------------------------------------
echo "[4/5] Deploying programs to devnet..."
echo ""

PROGRAMS=("shared_oracle" "volswap" "funding_swap" "exotic_vault" "private_intents")

for PROGRAM in "${PROGRAMS[@]}"; do
  echo "  Deploying $PROGRAM..."
  anchor deploy --provider.cluster devnet --program-name "$PROGRAM" 2>&1 | tail -1
  echo ""
done

echo "  Deployment complete."
echo ""

# ---------------------------------------------------------------------------
# 5. Print deployed program IDs
# ---------------------------------------------------------------------------
echo "[5/5] Deployed Program IDs:"
echo "  -----------------------------------------"

for PROGRAM in "${PROGRAMS[@]}"; do
  KEYPAIR="target/deploy/${PROGRAM}-keypair.json"
  if [ -f "$KEYPAIR" ]; then
    PROGRAM_ID=$(solana address -k "$KEYPAIR")
    echo "  $PROGRAM: $PROGRAM_ID"
  else
    echo "  $PROGRAM: (keypair not found at $KEYPAIR)"
  fi
done

echo "  -----------------------------------------"
echo ""
echo "============================================="
echo "  Devnet deployment complete!"
echo ""
echo "  Next steps:"
echo "    1. Update Anchor.toml [programs.devnet] with the program IDs above"
echo "    2. Run: npm run setup:devnet"
echo "    3. Run: npm run export:idl"
echo "============================================="
