/**
 * Tests that the SDK exports all expected public API items.
 * This verifies the barrel exports from index.ts are correct.
 */
import * as SDK from "../index";

describe("SDK public exports", () => {
  describe("Client classes", () => {
    it("should export SigmaClient", () => {
      expect(SDK.SigmaClient).toBeDefined();
      expect(typeof SDK.SigmaClient).toBe("function");
    });

    it("should export SigmaClient as default export", () => {
      expect(SDK.default).toBe(SDK.SigmaClient);
    });

    it("should export OracleClient", () => {
      expect(SDK.OracleClient).toBeDefined();
      expect(typeof SDK.OracleClient).toBe("function");
    });

    it("should export VolswapClient", () => {
      expect(SDK.VolswapClient).toBeDefined();
      expect(typeof SDK.VolswapClient).toBe("function");
    });

    it("should export FundingSwapClient", () => {
      expect(SDK.FundingSwapClient).toBeDefined();
      expect(typeof SDK.FundingSwapClient).toBe("function");
    });

    it("should export ExoticVaultClient", () => {
      expect(SDK.ExoticVaultClient).toBeDefined();
      expect(typeof SDK.ExoticVaultClient).toBe("function");
    });
  });

  describe("Constants", () => {
    it("should export PROGRAM_IDS", () => {
      expect(SDK.PROGRAM_IDS).toBeDefined();
      expect(typeof SDK.PROGRAM_IDS).toBe("object");
    });

    it("should export DEFAULT_CONFIG", () => {
      expect(SDK.DEFAULT_CONFIG).toBeDefined();
      expect(SDK.DEFAULT_CONFIG.cluster).toBe("devnet");
    });
  });

  describe("Utility functions", () => {
    it("should export bpsToDecimal", () => {
      expect(typeof SDK.bpsToDecimal).toBe("function");
    });

    it("should export decimalToBps", () => {
      expect(typeof SDK.decimalToBps).toBe("function");
    });

    it("should export formatTokenAmount", () => {
      expect(typeof SDK.formatTokenAmount).toBe("function");
    });

    it("should export parseTokenAmount", () => {
      expect(typeof SDK.parseTokenAmount).toBe("function");
    });

    it("should export varianceToAnnualizedVol", () => {
      expect(typeof SDK.varianceToAnnualizedVol).toBe("function");
    });

    it("should export fundingRateToAPR", () => {
      expect(typeof SDK.fundingRateToAPR).toBe("function");
    });
  });

  describe("PDA derivation functions", () => {
    it("should export Oracle PDA helpers", () => {
      expect(typeof SDK.findPriceFeedPDA).toBe("function");
      expect(typeof SDK.findSampleBufferPDA).toBe("function");
      expect(typeof SDK.findFundingFeedPDA).toBe("function");
      expect(typeof SDK.findVarianceTrackerPDA).toBe("function");
      expect(typeof SDK.findVolatilityIndexPDA).toBe("function");
      expect(typeof SDK.findCexFundingFeedPDA).toBe("function");
      expect(typeof SDK.findSecondaryMarketPDA).toBe("function");
      expect(typeof SDK.findPositionTokenPDA).toBe("function");
    });

    it("should export Volswap PDA helpers", () => {
      expect(typeof SDK.findVariancePoolPDA).toBe("function");
      expect(typeof SDK.findPoolVaultPDA).toBe("function");
      expect(typeof SDK.findVariancePositionPDA).toBe("function");
      expect(typeof SDK.findVolswapLpAccountPDA).toBe("function");
    });

    it("should export Funding Swap PDA helpers", () => {
      expect(typeof SDK.findFundingPoolPDA).toBe("function");
      expect(typeof SDK.findFundingPoolVaultPDA).toBe("function");
      expect(typeof SDK.findFundingSwapPositionPDA).toBe("function");
      expect(typeof SDK.findFundingSwapLpAccountPDA).toBe("function");
    });

    it("should export Exotic Vault PDA helpers", () => {
      expect(typeof SDK.findExoticVaultPDA).toBe("function");
      expect(typeof SDK.findVaultCollateralPDA).toBe("function");
      expect(typeof SDK.findExoticOptionPDA).toBe("function");
      expect(typeof SDK.findOptionSampleBufferPDA).toBe("function");
      expect(typeof SDK.findExoticVaultLpAccountPDA).toBe("function");
    });
  });
});
