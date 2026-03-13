import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  PROGRAM_IDS,
  DEFAULT_CONFIG,
  SigmaConfig,
  PriceFeed,
  FundingFeed,
  VarianceTracker,
  VolatilityIndex,
  CexFundingFeed,
  PositionToken,
  VariancePool,
  VariancePosition,
  LiquidityProvider,
  FundingPool,
  FundingSwapPosition,
  ExoticVault,
  ExoticOption,
  PriceSampleBuffer,
  PriceSample,
  PositionType,
  PositionStatus,
  SwapStatus,
  OptionType,
  OptionStatus,
} from "../types";

describe("PROGRAM_IDS", () => {
  it("should have all five program IDs defined", () => {
    expect(PROGRAM_IDS.SHARED_ORACLE).toBeInstanceOf(PublicKey);
    expect(PROGRAM_IDS.VOLSWAP).toBeInstanceOf(PublicKey);
    expect(PROGRAM_IDS.FUNDING_SWAP).toBeInstanceOf(PublicKey);
    expect(PROGRAM_IDS.EXOTIC_VAULT).toBeInstanceOf(PublicKey);
    expect(PROGRAM_IDS.PRIVATE_INTENTS).toBeInstanceOf(PublicKey);
  });

  it("should have unique program IDs", () => {
    const ids = [
      PROGRAM_IDS.SHARED_ORACLE,
      PROGRAM_IDS.VOLSWAP,
      PROGRAM_IDS.FUNDING_SWAP,
      PROGRAM_IDS.EXOTIC_VAULT,
      PROGRAM_IDS.PRIVATE_INTENTS,
    ];
    const uniqueIds = new Set(ids.map((id) => id.toBase58()));
    expect(uniqueIds.size).toBe(5);
  });

  it("SHARED_ORACLE should match expected address", () => {
    expect(PROGRAM_IDS.SHARED_ORACLE.toBase58()).toBe(
      "81SjyEmtwJUeqU9ZEfc7sm9evVpDuGwRSLrFQeCF4j5o"
    );
  });

  it("VOLSWAP should match expected address", () => {
    expect(PROGRAM_IDS.VOLSWAP.toBase58()).toBe(
      "FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS"
    );
  });

  it("FUNDING_SWAP should match expected address", () => {
    expect(PROGRAM_IDS.FUNDING_SWAP.toBase58()).toBe(
      "GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx"
    );
  });

  it("EXOTIC_VAULT should match expected address", () => {
    expect(PROGRAM_IDS.EXOTIC_VAULT.toBase58()).toBe(
      "6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P"
    );
  });

  it("PRIVATE_INTENTS should match expected address", () => {
    expect(PROGRAM_IDS.PRIVATE_INTENTS.toBase58()).toBe(
      "AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow"
    );
  });

  it("should be readonly (const assertion)", () => {
    // Verify the PROGRAM_IDS object exists and has the expected shape
    const keys = Object.keys(PROGRAM_IDS);
    expect(keys).toContain("SHARED_ORACLE");
    expect(keys).toContain("VOLSWAP");
    expect(keys).toContain("FUNDING_SWAP");
    expect(keys).toContain("EXOTIC_VAULT");
    expect(keys).toContain("PRIVATE_INTENTS");
    expect(keys.length).toBe(5);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("should have cluster set to devnet", () => {
    expect(DEFAULT_CONFIG.cluster).toBe("devnet");
  });

  it("should have commitment set to confirmed", () => {
    expect(DEFAULT_CONFIG.commitment).toBe("confirmed");
  });

  it("should satisfy the SigmaConfig interface", () => {
    const config: SigmaConfig = DEFAULT_CONFIG;
    expect(config.cluster).toBeDefined();
  });
});

describe("SigmaConfig cluster type", () => {
  it("should accept valid cluster values", () => {
    const devnet: SigmaConfig = { cluster: "devnet" };
    const mainnet: SigmaConfig = { cluster: "mainnet-beta" };
    const localnet: SigmaConfig = { cluster: "localnet" };
    expect(devnet.cluster).toBe("devnet");
    expect(mainnet.cluster).toBe("mainnet-beta");
    expect(localnet.cluster).toBe("localnet");
  });

  it("should accept optional commitment", () => {
    const config: SigmaConfig = {
      cluster: "devnet",
      commitment: "finalized",
    };
    expect(config.commitment).toBe("finalized");
  });
});

describe("Type structure validation", () => {
  it("PositionType should represent three derivative types", () => {
    const varianceSwap: PositionType = { varianceSwap: {} };
    const fundingSwap: PositionType = { fundingSwap: {} };
    const exoticOption: PositionType = { exoticOption: {} };
    expect(varianceSwap).toBeDefined();
    expect(fundingSwap).toBeDefined();
    expect(exoticOption).toBeDefined();
  });

  it("PositionStatus should represent four states", () => {
    const active: PositionStatus = { active: {} };
    const settled: PositionStatus = { settled: {} };
    const claimed: PositionStatus = { claimed: {} };
    const closedEarly: PositionStatus = { closedEarly: {} };
    expect(active).toBeDefined();
    expect(settled).toBeDefined();
    expect(claimed).toBeDefined();
    expect(closedEarly).toBeDefined();
  });

  it("SwapStatus should represent three states", () => {
    const active: SwapStatus = { active: {} };
    const settled: SwapStatus = { settled: {} };
    const closedEarly: SwapStatus = { closedEarly: {} };
    expect(active).toBeDefined();
    expect(settled).toBeDefined();
    expect(closedEarly).toBeDefined();
  });

  it("OptionType should represent ten option types", () => {
    const types: OptionType[] = [
      { asianCall: {} },
      { asianPut: {} },
      { upAndOutCall: {} },
      { downAndOutCall: {} },
      { upAndOutPut: {} },
      { downAndOutPut: {} },
      { upAndInCall: {} },
      { downAndInCall: {} },
      { upAndInPut: {} },
      { downAndInPut: {} },
    ];
    expect(types.length).toBe(10);
  });

  it("OptionStatus should represent six states", () => {
    const statuses: OptionStatus[] = [
      { active: {} },
      { knockedOut: {} },
      { knockedIn: {} },
      { settled: {} },
      { claimed: {} },
      { expired: {} },
    ];
    expect(statuses.length).toBe(6);
  });
});

describe("Interface shape tests", () => {
  it("PriceFeed should have the expected fields", () => {
    const feed: PriceFeed = {
      authority: PublicKey.default,
      assetMint: PublicKey.default,
      symbol: "SOL",
      latestPrice: new BN(0),
      latestTimestamp: new BN(0),
      confidence: new BN(0),
      sampleInterval: new BN(60),
      maxSamples: 100,
      isActive: true,
      bump: 254,
    };
    expect(feed.symbol).toBe("SOL");
    expect(feed.isActive).toBe(true);
    expect(feed.maxSamples).toBe(100);
  });

  it("VariancePool should have pool configuration fields", () => {
    const pool: VariancePool = {
      authority: PublicKey.default,
      collateralMint: PublicKey.default,
      underlyingMint: PublicKey.default,
      priceFeed: PublicKey.default,
      varianceTracker: PublicKey.default,
      epochDurationSeconds: new BN(86400),
      minNotional: new BN(1000),
      maxNotional: new BN(1000000),
      feeRateBps: 50,
      initialStrikeVarianceBps: new BN(5000),
      varianceCapBps: new BN(20000),
      earlyExitPenaltyBps: 500,
      currentEpoch: new BN(1),
      currentStrikeVarianceBps: new BN(5000),
      totalLpShares: new BN(0),
      totalLiquidity: new BN(0),
      totalLongNotional: new BN(0),
      totalShortNotional: new BN(0),
      isActive: true,
      isEpochSettled: false,
      bump: 255,
      vaultBump: 254,
    };
    expect(pool.feeRateBps).toBe(50);
    expect(pool.isActive).toBe(true);
    expect(pool.isEpochSettled).toBe(false);
    expect(pool.epochDurationSeconds.toNumber()).toBe(86400);
  });

  it("FundingPool should have funding swap specific fields", () => {
    const pool: FundingPool = {
      authority: PublicKey.default,
      collateralMint: PublicKey.default,
      fundingFeed: PublicKey.default,
      marketSymbol: "SOL-PERP",
      swapDurationSeconds: new BN(604800),
      minNotional: new BN(1000),
      maxNotional: new BN(1000000),
      feeRateBps: 50,
      maxRateSpreadBps: 200,
      totalLpShares: new BN(0),
      totalLiquidity: new BN(0),
      totalReceiveFixedNotional: new BN(0),
      totalPayFixedNotional: new BN(0),
      isActive: true,
      bump: 255,
      vaultBump: 254,
    };
    expect(pool.marketSymbol).toBe("SOL-PERP");
    expect(pool.maxRateSpreadBps).toBe(200);
  });

  it("ExoticOption should support optional barrier fields", () => {
    const option: ExoticOption = {
      owner: PublicKey.default,
      vault: PublicKey.default,
      optionIndex: new BN(0),
      optionType: { asianCall: {} },
      strikePrice: new BN(100_000_000),
      barrierPrice: null,
      notional: new BN(1_000_000),
      premiumPaid: new BN(50_000),
      durationDays: 30,
      startTime: new BN(0),
      expiryTime: new BN(0),
      barrierBreached: false,
      barrierBreachTime: null,
      barrierBreachPrice: null,
      settlementPrice: null,
      payoutAmount: new BN(0),
      status: { active: {} },
      settledAt: null,
      bump: 255,
    };
    expect(option.barrierPrice).toBeNull();
    expect(option.barrierBreached).toBe(false);
    expect(option.durationDays).toBe(30);
  });

  it("PriceSample should have price and timestamp", () => {
    const sample: PriceSample = {
      price: new BN(150_000_000),
      timestamp: new BN(1700000000),
    };
    expect(sample.price.toNumber()).toBe(150_000_000);
  });
});
