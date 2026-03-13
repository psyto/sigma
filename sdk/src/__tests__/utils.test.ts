import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  bpsToDecimal,
  decimalToBps,
  formatTokenAmount,
  parseTokenAmount,
  varianceToAnnualizedVol,
  fundingRateToAPR,
  findPriceFeedPDA,
  findSampleBufferPDA,
  findFundingFeedPDA,
  findVarianceTrackerPDA,
  findVolatilityIndexPDA,
  findCexFundingFeedPDA,
  findSecondaryMarketPDA,
  findPositionTokenPDA,
  findVariancePoolPDA,
  findPoolVaultPDA,
  findVariancePositionPDA,
  findVolswapLpAccountPDA,
  findFundingPoolPDA,
  findFundingPoolVaultPDA,
  findFundingSwapPositionPDA,
  findFundingSwapLpAccountPDA,
  findExoticVaultPDA,
  findVaultCollateralPDA,
  findExoticOptionPDA,
  findOptionSampleBufferPDA,
  findExoticVaultLpAccountPDA,
} from "../utils";
import { PROGRAM_IDS } from "../types";

// ============================================================================
// Conversion Utility Tests
// ============================================================================

describe("bpsToDecimal", () => {
  it("should convert 50 bps to 0.005", () => {
    expect(bpsToDecimal(50)).toBeCloseTo(0.005);
  });

  it("should convert 100 bps to 0.01 (1%)", () => {
    expect(bpsToDecimal(100)).toBeCloseTo(0.01);
  });

  it("should convert 10000 bps to 1.0 (100%)", () => {
    expect(bpsToDecimal(10000)).toBeCloseTo(1.0);
  });

  it("should convert 0 bps to 0", () => {
    expect(bpsToDecimal(0)).toBe(0);
  });

  it("should convert 1 bps to 0.0001", () => {
    expect(bpsToDecimal(1)).toBeCloseTo(0.0001);
  });
});

describe("decimalToBps", () => {
  it("should convert 0.005 to 50 bps", () => {
    expect(decimalToBps(0.005)).toBe(50);
  });

  it("should convert 0.01 to 100 bps", () => {
    expect(decimalToBps(0.01)).toBe(100);
  });

  it("should convert 1.0 to 10000 bps", () => {
    expect(decimalToBps(1.0)).toBe(10000);
  });

  it("should convert 0 to 0 bps", () => {
    expect(decimalToBps(0)).toBe(0);
  });

  it("should truncate fractional bps", () => {
    // 0.00015 -> 1.5 bps -> truncates to 1
    expect(decimalToBps(0.00015)).toBe(1);
  });

  it("should be the inverse of bpsToDecimal", () => {
    expect(decimalToBps(bpsToDecimal(100))).toBe(100);
    expect(decimalToBps(bpsToDecimal(5000))).toBe(5000);
    expect(bpsToDecimal(decimalToBps(0.05))).toBeCloseTo(0.05);
  });
});

describe("formatTokenAmount", () => {
  it("should format a whole token amount with 6 decimals", () => {
    const amount = new BN("1000000"); // 1.000000
    expect(formatTokenAmount(amount, 6)).toBe("1.000000");
  });

  it("should format a fractional token amount with 6 decimals", () => {
    const amount = new BN("1500000"); // 1.500000
    expect(formatTokenAmount(amount, 6)).toBe("1.500000");
  });

  it("should format a large amount", () => {
    const amount = new BN("1000000000000"); // 1,000,000 tokens with 6 decimals
    expect(formatTokenAmount(amount, 6)).toBe("1000000.000000");
  });

  it("should format zero", () => {
    const amount = new BN(0);
    expect(formatTokenAmount(amount, 6)).toBe("0.000000");
  });

  it("should format with 9 decimals (SOL-like)", () => {
    const amount = new BN("1000000000"); // 1 SOL
    expect(formatTokenAmount(amount, 9)).toBe("1.000000000");
  });

  it("should format sub-unit amounts", () => {
    const amount = new BN("500"); // 0.000500 with 6 decimals
    expect(formatTokenAmount(amount, 6)).toBe("0.000500");
  });
});

describe("parseTokenAmount", () => {
  it("should parse a whole number", () => {
    const result = parseTokenAmount("1", 6);
    expect(result.toString()).toBe("1000000");
  });

  it("should parse a decimal number", () => {
    const result = parseTokenAmount("1.5", 6);
    expect(result.toString()).toBe("1500000");
  });

  it("should parse a number with full precision", () => {
    const result = parseTokenAmount("1.123456", 6);
    expect(result.toString()).toBe("1123456");
  });

  it("should pad missing decimal places", () => {
    const result = parseTokenAmount("1.1", 6);
    expect(result.toString()).toBe("1100000");
  });

  it("should truncate excess decimal places", () => {
    const result = parseTokenAmount("1.1234567890", 6);
    expect(result.toString()).toBe("1123456");
  });

  it("should handle zero", () => {
    const result = parseTokenAmount("0", 6);
    expect(result.toString()).toBe("0");
  });

  it("should round-trip with formatTokenAmount", () => {
    const original = "123.456789";
    const parsed = parseTokenAmount(original, 6);
    const formatted = formatTokenAmount(parsed, 6);
    expect(formatted).toBe("123.456789");
  });
});

describe("varianceToAnnualizedVol", () => {
  it("should compute annualized vol from variance in bps", () => {
    // 100 bps variance = 1% daily variance
    // annualized vol = sqrt(0.01 * 365) * 100
    const result = varianceToAnnualizedVol(100);
    const expected = Math.sqrt(0.01 * 365) * 100;
    expect(result).toBeCloseTo(expected);
  });

  it("should return 0 for zero variance", () => {
    expect(varianceToAnnualizedVol(0)).toBe(0);
  });

  it("should handle large variance values", () => {
    const result = varianceToAnnualizedVol(10000);
    const expected = Math.sqrt(1.0 * 365) * 100;
    expect(result).toBeCloseTo(expected);
  });
});

describe("fundingRateToAPR", () => {
  it("should convert 8-hour funding rate to APR", () => {
    // 0.01% per 8 hours = 0.01 * 3 * 365 = 10.95%
    expect(fundingRateToAPR(0.01)).toBeCloseTo(10.95);
  });

  it("should return 0 for zero rate", () => {
    expect(fundingRateToAPR(0)).toBe(0);
  });

  it("should handle negative rates", () => {
    expect(fundingRateToAPR(-0.01)).toBeCloseTo(-10.95);
  });

  it("should correctly multiply by 3*365 = 1095", () => {
    expect(fundingRateToAPR(1)).toBeCloseTo(1095);
  });
});

// ============================================================================
// PDA Derivation Tests
// ============================================================================

describe("Oracle PDA derivations", () => {
  const testMint = new PublicKey("So11111111111111111111111111111111111111112");

  it("findPriceFeedPDA should return a valid PublicKey and bump", () => {
    const [pda, bump] = findPriceFeedPDA(testMint);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe("number");
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it("findPriceFeedPDA should be deterministic", () => {
    const [pda1] = findPriceFeedPDA(testMint);
    const [pda2] = findPriceFeedPDA(testMint);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("findPriceFeedPDA should return different PDAs for different mints", () => {
    const mint2 = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const [pda1] = findPriceFeedPDA(testMint);
    const [pda2] = findPriceFeedPDA(mint2);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("findSampleBufferPDA should return a valid PublicKey", () => {
    const [priceFeed] = findPriceFeedPDA(testMint);
    const [sampleBuffer, bump] = findSampleBufferPDA(priceFeed);
    expect(sampleBuffer).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("findFundingFeedPDA should work with market symbols", () => {
    const [pda1] = findFundingFeedPDA("SOL-PERP");
    const [pda2] = findFundingFeedPDA("BTC-PERP");
    expect(pda1).toBeInstanceOf(PublicKey);
    expect(pda2).toBeInstanceOf(PublicKey);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("findVarianceTrackerPDA should derive from price feed", () => {
    const [priceFeed] = findPriceFeedPDA(testMint);
    const [tracker, bump] = findVarianceTrackerPDA(priceFeed);
    expect(tracker).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("findVolatilityIndexPDA should work with index names", () => {
    const [pda1] = findVolatilityIndexPDA("SOL-VOL-INDEX");
    const [pda2] = findVolatilityIndexPDA("ETH-VOL-INDEX");
    expect(pda1).toBeInstanceOf(PublicKey);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("findCexFundingFeedPDA should derive for market symbols", () => {
    const [pda, bump] = findCexFundingFeedPDA("SOL-PERP");
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("findSecondaryMarketPDA should return a consistent address", () => {
    const [pda1] = findSecondaryMarketPDA();
    const [pda2] = findSecondaryMarketPDA();
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("findPositionTokenPDA should derive from program and position", () => {
    const program = PROGRAM_IDS.VOLSWAP;
    const position = PublicKey.unique();
    const [pda, bump] = findPositionTokenPDA(program, position);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });
});

describe("Volswap PDA derivations", () => {
  const testMint = new PublicKey("So11111111111111111111111111111111111111112");
  const testUser = PublicKey.unique();

  it("findVariancePoolPDA should be deterministic for a given mint", () => {
    const [pda1] = findVariancePoolPDA(testMint);
    const [pda2] = findVariancePoolPDA(testMint);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("findPoolVaultPDA should derive from pool", () => {
    const [pool] = findVariancePoolPDA(testMint);
    const [vault, bump] = findPoolVaultPDA(pool);
    expect(vault).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("findVariancePositionPDA should include user and epoch", () => {
    const [pool] = findVariancePoolPDA(testMint);
    const epoch1 = new BN(1);
    const epoch2 = new BN(2);
    const [pos1] = findVariancePositionPDA(pool, testUser, epoch1);
    const [pos2] = findVariancePositionPDA(pool, testUser, epoch2);
    expect(pos1.equals(pos2)).toBe(false);
  });

  it("findVolswapLpAccountPDA should derive from pool and user", () => {
    const [pool] = findVariancePoolPDA(testMint);
    const user1 = PublicKey.unique();
    const user2 = PublicKey.unique();
    const [lp1] = findVolswapLpAccountPDA(pool, user1);
    const [lp2] = findVolswapLpAccountPDA(pool, user2);
    expect(lp1).toBeInstanceOf(PublicKey);
    expect(lp1.equals(lp2)).toBe(false);
  });
});

describe("Funding Swap PDA derivations", () => {
  const testUser = PublicKey.unique();

  it("findFundingPoolPDA should derive from market symbol", () => {
    const [pda1] = findFundingPoolPDA("SOL-PERP");
    const [pda2] = findFundingPoolPDA("BTC-PERP");
    expect(pda1).toBeInstanceOf(PublicKey);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("findFundingPoolVaultPDA should derive from pool", () => {
    const [pool] = findFundingPoolPDA("SOL-PERP");
    const [vault, bump] = findFundingPoolVaultPDA(pool);
    expect(vault).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("findFundingSwapPositionPDA should include pool, user, and swapId", () => {
    const [pool] = findFundingPoolPDA("SOL-PERP");
    const swapId1 = new BN(0);
    const swapId2 = new BN(1);
    const [pos1] = findFundingSwapPositionPDA(pool, testUser, swapId1);
    const [pos2] = findFundingSwapPositionPDA(pool, testUser, swapId2);
    expect(pos1.equals(pos2)).toBe(false);
  });

  it("findFundingSwapLpAccountPDA should derive from pool and user", () => {
    const [pool] = findFundingPoolPDA("SOL-PERP");
    const [lp, bump] = findFundingSwapLpAccountPDA(pool, testUser);
    expect(lp).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });
});

describe("Exotic Vault PDA derivations", () => {
  const testMint = new PublicKey("So11111111111111111111111111111111111111112");
  const testUser = PublicKey.unique();

  it("findExoticVaultPDA should be deterministic", () => {
    const [pda1] = findExoticVaultPDA(testMint);
    const [pda2] = findExoticVaultPDA(testMint);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("findVaultCollateralPDA should derive from vault", () => {
    const [vault] = findExoticVaultPDA(testMint);
    const [collateral, bump] = findVaultCollateralPDA(vault);
    expect(collateral).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("findExoticOptionPDA should include vault, user, and option index", () => {
    const [vault] = findExoticVaultPDA(testMint);
    const idx1 = new BN(0);
    const idx2 = new BN(1);
    const [opt1] = findExoticOptionPDA(vault, testUser, idx1);
    const [opt2] = findExoticOptionPDA(vault, testUser, idx2);
    expect(opt1.equals(opt2)).toBe(false);
  });

  it("findOptionSampleBufferPDA should derive from option", () => {
    const [vault] = findExoticVaultPDA(testMint);
    const [option] = findExoticOptionPDA(vault, testUser, new BN(0));
    const [buffer, bump] = findOptionSampleBufferPDA(option);
    expect(buffer).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("findExoticVaultLpAccountPDA should derive from vault and user", () => {
    const [vault] = findExoticVaultPDA(testMint);
    const [lp, bump] = findExoticVaultLpAccountPDA(vault, testUser);
    expect(lp).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });
});
