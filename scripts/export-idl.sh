#!/usr/bin/env bash
# =============================================================================
# Sigma Protocol - IDL Export Script
# =============================================================================
# Copies generated IDL files from target/idl/ to idl/ for easy distribution.
#
# Usage: bash scripts/export-idl.sh
# =============================================================================

set -euo pipefail

SOURCE_DIR="target/idl"
DEST_DIR="idl"

echo "============================================="
echo "  Sigma Protocol - IDL Export"
echo "============================================="
echo ""

# Check that source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: $SOURCE_DIR not found."
  echo "Run 'anchor build' first to generate IDL files."
  exit 1
fi

# Create destination directory
mkdir -p "$DEST_DIR"

# List of expected IDL files
PROGRAMS=("shared_oracle" "volswap" "funding_swap" "exotic_vault" "private_intents")
COPIED=0

for PROGRAM in "${PROGRAMS[@]}"; do
  IDL_FILE="${SOURCE_DIR}/${PROGRAM}.json"
  if [ -f "$IDL_FILE" ]; then
    cp "$IDL_FILE" "$DEST_DIR/"
    echo "  [OK] $PROGRAM.json"
    COPIED=$((COPIED + 1))
  else
    echo "  [SKIP] $PROGRAM.json not found in $SOURCE_DIR"
  fi
done

echo ""
echo "Exported $COPIED IDL files to $DEST_DIR/"
echo ""

# Also copy any TypeScript type files if they exist
TS_DIR="target/types"
if [ -d "$TS_DIR" ]; then
  mkdir -p "$DEST_DIR/types"
  TS_COUNT=0
  for TS_FILE in "$TS_DIR"/*.ts; do
    if [ -f "$TS_FILE" ]; then
      cp "$TS_FILE" "$DEST_DIR/types/"
      TS_COUNT=$((TS_COUNT + 1))
    fi
  done
  if [ $TS_COUNT -gt 0 ]; then
    echo "Exported $TS_COUNT TypeScript type files to $DEST_DIR/types/"
  fi
fi

echo ""
echo "============================================="
echo "  IDL export complete!"
echo "============================================="
