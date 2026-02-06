import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PROGRAM_IDS } from "./types";

// ============================================================================
// Oracle PDAs
// ============================================================================

export function findPriceFeedPDA(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("price_feed"), assetMint.toBuffer()],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

export function findSampleBufferPDA(priceFeed: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sample_buffer"), priceFeed.toBuffer()],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

export function findFundingFeedPDA(marketSymbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("funding_feed"), Buffer.from(marketSymbol)],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

export function findVarianceTrackerPDA(priceFeed: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("variance_tracker"), priceFeed.toBuffer()],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

export function findVolatilityIndexPDA(name: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("volatility_index"), Buffer.from(name)],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

export function findCexFundingFeedPDA(marketSymbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cex_funding"), Buffer.from(marketSymbol)],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

export function findSecondaryMarketPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("secondary_market")],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

export function findPositionTokenPDA(
  originalProgram: PublicKey,
  originalPosition: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position_token"),
      originalProgram.toBuffer(),
      originalPosition.toBuffer(),
    ],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

// ============================================================================
// Volswap PDAs
// ============================================================================

export function findVariancePoolPDA(underlyingMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("variance_pool"), underlyingMint.toBuffer()],
    PROGRAM_IDS.VOLSWAP
  );
}

export function findPoolVaultPDA(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), pool.toBuffer()],
    PROGRAM_IDS.VOLSWAP
  );
}

export function findVariancePositionPDA(
  pool: PublicKey,
  user: PublicKey,
  epoch: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      pool.toBuffer(),
      user.toBuffer(),
      epoch.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_IDS.VOLSWAP
  );
}

export function findVolswapLpAccountPDA(
  pool: PublicKey,
  user: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), pool.toBuffer(), user.toBuffer()],
    PROGRAM_IDS.VOLSWAP
  );
}

// ============================================================================
// Funding Swap PDAs
// ============================================================================

export function findFundingPoolPDA(marketSymbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("funding_pool"), Buffer.from(marketSymbol)],
    PROGRAM_IDS.FUNDING_SWAP
  );
}

export function findFundingPoolVaultPDA(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), pool.toBuffer()],
    PROGRAM_IDS.FUNDING_SWAP
  );
}

export function findFundingSwapPositionPDA(
  pool: PublicKey,
  user: PublicKey,
  swapId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("swap_position"),
      pool.toBuffer(),
      user.toBuffer(),
      swapId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_IDS.FUNDING_SWAP
  );
}

export function findFundingSwapLpAccountPDA(
  pool: PublicKey,
  user: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), pool.toBuffer(), user.toBuffer()],
    PROGRAM_IDS.FUNDING_SWAP
  );
}

// ============================================================================
// Exotic Vault PDAs
// ============================================================================

export function findExoticVaultPDA(underlyingMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("exotic_vault"), underlyingMint.toBuffer()],
    PROGRAM_IDS.EXOTIC_VAULT
  );
}

export function findVaultCollateralPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_collateral"), vault.toBuffer()],
    PROGRAM_IDS.EXOTIC_VAULT
  );
}

export function findExoticOptionPDA(
  vault: PublicKey,
  user: PublicKey,
  optionIndex: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("option"),
      vault.toBuffer(),
      user.toBuffer(),
      optionIndex.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_IDS.EXOTIC_VAULT
  );
}

export function findOptionSampleBufferPDA(option: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("samples"), option.toBuffer()],
    PROGRAM_IDS.EXOTIC_VAULT
  );
}

export function findExoticVaultLpAccountPDA(
  vault: PublicKey,
  user: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), vault.toBuffer(), user.toBuffer()],
    PROGRAM_IDS.EXOTIC_VAULT
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert basis points to decimal percentage (e.g., 50 bps -> 0.005)
 */
export function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

/**
 * Convert decimal percentage to basis points (e.g., 0.005 -> 50 bps)
 */
export function decimalToBps(decimal: number): number {
  return Math.round(decimal * 10000);
}

/**
 * Format a token amount with decimals
 */
export function formatTokenAmount(amount: BN, decimals: number): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = amount.div(divisor);
  const fraction = amount.mod(divisor);
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${whole.toString()}.${fractionStr}`;
}

/**
 * Parse a token amount string to BN
 */
export function parseTokenAmount(amount: string, decimals: number): BN {
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return new BN(whole + paddedFraction);
}

/**
 * Calculate annualized volatility from variance (in basis points)
 */
export function varianceToAnnualizedVol(varianceBps: number): number {
  // Assuming 365 days per year, daily variance
  return Math.sqrt(varianceBps / 10000 * 365) * 100;
}

/**
 * Calculate funding rate APR from 8-hour rate
 */
export function fundingRateToAPR(rate8h: number): number {
  // 3 funding periods per day * 365 days
  return rate8h * 3 * 365;
}
