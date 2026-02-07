import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  PROGRAM_IDS,
  PriceFeed,
  FundingFeed,
  VarianceTracker,
  VolatilityIndex,
  CexFundingFeed,
  PositionToken,
} from "./types";
import {
  findPriceFeedPDA,
  findSampleBufferPDA,
  findFundingFeedPDA,
  findVarianceTrackerPDA,
  findVolatilityIndexPDA,
  findCexFundingFeedPDA,
  findSecondaryMarketPDA,
  findPositionTokenPDA,
} from "./utils";

/**
 * Client for interacting with the Sigma SharedOracle program
 */
export class OracleClient {
  private program: Program;
  private provider: AnchorProvider;

  constructor(provider: AnchorProvider, idl?: any) {
    this.provider = provider;
    // In production, load IDL from file or anchor workspace
    this.program = new Program(idl, provider);
  }

  get connection(): Connection {
    return this.provider.connection;
  }

  get programId(): PublicKey {
    return PROGRAM_IDS.SHARED_ORACLE;
  }

  // ============================================================================
  // Price Feed Methods
  // ============================================================================

  /**
   * Initialize a new price feed
   */
  async initializePriceFeed(
    assetMint: PublicKey,
    symbol: string,
    sampleInterval: BN,
    maxSamples: number
  ): Promise<string> {
    const [priceFeed] = findPriceFeedPDA(assetMint);
    const [sampleBuffer] = findSampleBufferPDA(priceFeed);

    return this.program.methods
      .initializePriceFeed(symbol, sampleInterval, maxSamples)
      .accounts({
        authority: this.provider.wallet.publicKey,
        assetMint,
        priceFeed,
        sampleBuffer,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Record a new price
   */
  async recordPrice(assetMint: PublicKey, price: BN): Promise<string> {
    const [priceFeed] = findPriceFeedPDA(assetMint);
    const [sampleBuffer] = findSampleBufferPDA(priceFeed);

    return this.program.methods
      .recordPrice(price)
      .accounts({
        authority: this.provider.wallet.publicKey,
        priceFeed,
        sampleBuffer,
      })
      .rpc();
  }

  /**
   * Fetch a price feed account
   */
  async getPriceFeed(assetMint: PublicKey): Promise<PriceFeed | null> {
    const [priceFeed] = findPriceFeedPDA(assetMint);
    try {
      return await (this.program.account as any).priceFeed.fetch(priceFeed) as PriceFeed;
    } catch {
      return null;
    }
  }

  /**
   * Get all price feeds
   */
  async getAllPriceFeeds(): Promise<{ publicKey: PublicKey; account: PriceFeed }[]> {
    try {
      const accounts = await (this.program.account as any).priceFeed.all();
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as PriceFeed,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get the latest price for an asset
   */
  async getLatestPrice(assetMint: PublicKey): Promise<BN | null> {
    const feed = await this.getPriceFeed(assetMint);
    return feed?.latestPrice ?? null;
  }

  // ============================================================================
  // Funding Feed Methods
  // ============================================================================

  /**
   * Initialize a funding rate feed
   */
  async initializeFundingFeed(
    marketSymbol: string,
    fundingInterval: BN
  ): Promise<string> {
    const [fundingFeed] = findFundingFeedPDA(marketSymbol);

    return this.program.methods
      .initializeFundingFeed(marketSymbol, fundingInterval)
      .accounts({
        authority: this.provider.wallet.publicKey,
        fundingFeed,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Record a funding rate
   */
  async recordFundingRate(marketSymbol: string, rate: BN): Promise<string> {
    const [fundingFeed] = findFundingFeedPDA(marketSymbol);

    return this.program.methods
      .recordFundingRate(rate)
      .accounts({
        authority: this.provider.wallet.publicKey,
        fundingFeed,
      })
      .rpc();
  }

  /**
   * Fetch a funding feed account
   */
  async getFundingFeed(marketSymbol: string): Promise<FundingFeed | null> {
    const [fundingFeed] = findFundingFeedPDA(marketSymbol);
    try {
      return await (this.program.account as any).fundingFeed.fetch(fundingFeed) as unknown as FundingFeed;
    } catch {
      return null;
    }
  }

  /**
   * Get all funding feeds
   */
  async getAllFundingFeeds(): Promise<{ publicKey: PublicKey; account: FundingFeed }[]> {
    try {
      const accounts = await (this.program.account as any).fundingFeed.all();
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as FundingFeed,
      }));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Variance Tracker Methods
  // ============================================================================

  /**
   * Initialize a variance tracker
   */
  async initializeVarianceTracker(
    priceFeed: PublicKey,
    epochDuration: BN
  ): Promise<string> {
    const [varianceTracker] = findVarianceTrackerPDA(priceFeed);

    return this.program.methods
      .initializeVarianceTracker(epochDuration)
      .accounts({
        authority: this.provider.wallet.publicKey,
        priceFeed,
        varianceTracker,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Update variance calculation
   */
  async updateVariance(priceFeed: PublicKey): Promise<string> {
    const [varianceTracker] = findVarianceTrackerPDA(priceFeed);
    const [sampleBuffer] = findSampleBufferPDA(priceFeed);

    return this.program.methods
      .updateVariance()
      .accounts({
        authority: this.provider.wallet.publicKey,
        priceFeed,
        sampleBuffer,
        varianceTracker,
      })
      .rpc();
  }

  /**
   * Fetch a variance tracker account
   */
  async getVarianceTracker(priceFeed: PublicKey): Promise<VarianceTracker | null> {
    const [varianceTracker] = findVarianceTrackerPDA(priceFeed);
    try {
      return await (this.program.account as any).varianceTracker.fetch(varianceTracker) as unknown as VarianceTracker;
    } catch {
      return null;
    }
  }

  /**
   * Get all variance trackers
   */
  async getAllVarianceTrackers(): Promise<{ publicKey: PublicKey; account: VarianceTracker }[]> {
    try {
      const accounts = await (this.program.account as any).varianceTracker.all();
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as VarianceTracker,
      }));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Volatility Index (SVI) Methods
  // ============================================================================

  /**
   * Initialize a volatility index
   */
  async initializeVolatilityIndex(name: string): Promise<string> {
    const [volatilityIndex] = findVolatilityIndexPDA(name);

    return this.program.methods
      .initializeVolatilityIndex(name)
      .accounts({
        authority: this.provider.wallet.publicKey,
        volatilityIndex,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Add a component to the volatility index
   */
  async addIndexComponent(
    name: string,
    varianceTracker: PublicKey,
    weight: number
  ): Promise<string> {
    const [volatilityIndex] = findVolatilityIndexPDA(name);

    return this.program.methods
      .addIndexComponent(weight)
      .accounts({
        authority: this.provider.wallet.publicKey,
        volatilityIndex,
        varianceTracker,
      })
      .rpc();
  }

  /**
   * Update the volatility index
   */
  async updateVolatilityIndex(name: string): Promise<string> {
    const [volatilityIndex] = findVolatilityIndexPDA(name);

    return this.program.methods
      .updateVolatilityIndex()
      .accounts({
        authority: this.provider.wallet.publicKey,
        volatilityIndex,
      })
      .rpc();
  }

  /**
   * Fetch a volatility index account
   */
  async getVolatilityIndex(name: string): Promise<VolatilityIndex | null> {
    const [volatilityIndex] = findVolatilityIndexPDA(name);
    try {
      return await (this.program.account as any).volatilityIndex.fetch(volatilityIndex) as unknown as VolatilityIndex;
    } catch {
      return null;
    }
  }

  /**
   * Get all volatility indices
   */
  async getAllVolatilityIndices(): Promise<{ publicKey: PublicKey; account: VolatilityIndex }[]> {
    try {
      const accounts = await (this.program.account as any).volatilityIndex.all();
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as VolatilityIndex,
      }));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // CEX Funding Feed Methods
  // ============================================================================

  /**
   * Initialize a CEX funding feed
   */
  async initializeCexFundingFeed(marketSymbol: string): Promise<string> {
    const [cexFundingFeed] = findCexFundingFeedPDA(marketSymbol);

    return this.program.methods
      .initializeCexFundingFeed(marketSymbol)
      .accounts({
        authority: this.provider.wallet.publicKey,
        cexFundingFeed,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Fetch a CEX funding feed account
   */
  async getCexFundingFeed(marketSymbol: string): Promise<CexFundingFeed | null> {
    const [cexFundingFeed] = findCexFundingFeedPDA(marketSymbol);
    try {
      return await (this.program.account as any).cexFundingFeed.fetch(cexFundingFeed) as unknown as CexFundingFeed;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Secondary Market Methods
  // ============================================================================

  /**
   * Tokenize a position for trading on secondary market
   */
  async tokenizePosition(
    originalProgram: PublicKey,
    originalPosition: PublicKey,
    positionType: "varianceSwap" | "fundingSwap" | "exoticOption"
  ): Promise<string> {
    const [positionToken] = findPositionTokenPDA(originalProgram, originalPosition);
    const [secondaryMarket] = findSecondaryMarketPDA();

    const typeArg = { [positionType]: {} };

    return this.program.methods
      .tokenizePosition(typeArg)
      .accounts({
        owner: this.provider.wallet.publicKey,
        originalProgram,
        originalPosition,
        positionToken,
        secondaryMarket,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * List a position for sale
   */
  async listPosition(
    positionToken: PublicKey,
    price: BN
  ): Promise<string> {
    const [secondaryMarket] = findSecondaryMarketPDA();

    return this.program.methods
      .listPosition(price)
      .accounts({
        owner: this.provider.wallet.publicKey,
        positionToken,
        secondaryMarket,
      })
      .rpc();
  }

  /**
   * Buy a listed position
   */
  async buyPosition(
    positionToken: PublicKey,
    seller: PublicKey
  ): Promise<string> {
    const [secondaryMarket] = findSecondaryMarketPDA();

    return this.program.methods
      .buyPosition()
      .accounts({
        buyer: this.provider.wallet.publicKey,
        seller,
        positionToken,
        secondaryMarket,
      })
      .rpc();
  }

  /**
   * Fetch a position token account
   */
  async getPositionToken(
    originalProgram: PublicKey,
    originalPosition: PublicKey
  ): Promise<PositionToken | null> {
    const [positionToken] = findPositionTokenPDA(originalProgram, originalPosition);
    try {
      return await (this.program.account as any).positionToken.fetch(positionToken) as unknown as PositionToken;
    } catch {
      return null;
    }
  }
}
