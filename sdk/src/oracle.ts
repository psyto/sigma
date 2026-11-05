import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
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
  findOracleConfigPDA,
  findProgramDataAddress,
  SigmaProtocolName,
} from "./utils";

function protocolForProgram(programId: PublicKey): SigmaProtocolName {
  if (programId.equals(PROGRAM_IDS.VOLSWAP)) return "volSwap";
  if (programId.equals(PROGRAM_IDS.FUNDING_SWAP)) return "fundingSwap";
  if (programId.equals(PROGRAM_IDS.EXOTIC_VAULT)) return "exoticVault";
  throw new Error("account is not owned by a Sigma protocol program");
}

/** Anchor decodes the SigmaProtocol enum as e.g. `{ fundingSwap: {} }`. */
function protocolName(protocol: Record<string, unknown>): SigmaProtocolName {
  const name = Object.keys(protocol)[0];
  if (name !== "volSwap" && name !== "fundingSwap" && name !== "exoticVault") {
    throw new Error("unknown protocol: " + name);
  }
  return name;
}

/**
 * Client for interacting with the Sigma SharedOracle program
 */
export class OracleClient {
  private program: Program;
  private provider: AnchorProvider;

  constructor(provider: AnchorProvider, idl?: Idl) {
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
  /**
   * Create the program's admin config (once). The wallet must be the program's
   * upgrade authority; `admin` may then create the gated accounts.
   */
  async initializeOracleConfig(admin: PublicKey): Promise<string> {
    const [config] = findOracleConfigPDA();
    return this.program.methods
      .initializeOracleConfig(admin)
      .accounts({
        payer: this.provider.wallet.publicKey,
        config,
        program: PROGRAM_IDS.SHARED_ORACLE,
        programData: findProgramDataAddress(PROGRAM_IDS.SHARED_ORACLE),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Propose a new admin (the wallet must be the current admin).
   * Pass PublicKey.default to cancel a pending proposal.
   */
  async setAdmin(newAdmin: PublicKey): Promise<string> {
    return this.program.methods
      .setAdmin(newAdmin)
      .accounts({ admin: this.provider.wallet.publicKey, config: findOracleConfigPDA()[0] })
      .rpc();
  }

  /**
   * Accept a pending admin proposal (the wallet must be the proposed admin).
   */
  async acceptAdmin(): Promise<string> {
    return this.program.methods
      .acceptAdmin()
      .accounts({ newAdmin: this.provider.wallet.publicKey, config: findOracleConfigPDA()[0] })
      .rpc();
  }

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
        oracleConfig: findOracleConfigPDA()[0],
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
        oracleConfig: findOracleConfigPDA()[0],
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
        oracleConfig: findOracleConfigPDA()[0],
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
  async initializeVolatilityIndex(
    priceFeed: PublicKey,
    name: string,
    durationDays: number,
    impliedWeight: number
  ): Promise<string> {
    const [volatilityIndex] = findVolatilityIndexPDA(priceFeed, name);
    const [varianceTracker] = findVarianceTrackerPDA(priceFeed);

    return this.program.methods
      .initializeVolatilityIndex(name, durationDays, impliedWeight)
      .accounts({
        authority: this.provider.wallet.publicKey,
        oracleConfig: findOracleConfigPDA()[0],
        priceFeed,
        varianceTracker,
        volatilityIndex,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Update the volatility index from its variance tracker (permissionless)
   */
  async updateVolatilityIndex(priceFeed: PublicKey, name: string): Promise<string> {
    const [volatilityIndex] = findVolatilityIndexPDA(priceFeed, name);
    const [varianceTracker] = findVarianceTrackerPDA(priceFeed);

    return this.program.methods
      .updateVolatilityIndex()
      .accounts({
        payer: this.provider.wallet.publicKey,
        volatilityIndex,
        varianceTracker,
      })
      .rpc();
  }

  /**
   * Fetch a volatility index account
   */
  async getVolatilityIndex(priceFeed: PublicKey, name: string): Promise<VolatilityIndex | null> {
    const [volatilityIndex] = findVolatilityIndexPDA(priceFeed, name);
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
  async initializeCexFundingFeed(
    marketSymbol: string,
    aggregationMethod: object = { mean: {} }
  ): Promise<string> {
    const [cexFundingFeed] = findCexFundingFeedPDA(marketSymbol);

    return this.program.methods
      .initializeCexFundingFeed(marketSymbol, aggregationMethod)
      .accounts({
        authority: this.provider.wallet.publicKey,
        oracleConfig: findOracleConfigPDA()[0],
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
   * Tokenize a position for trading on the secondary market. The wallet must
   * own `originalPosition`, a live position of a Sigma protocol. The program
   * moves the position into custody of the position token PDA and reads its
   * terms and expiry on-chain (from the position and its pool / vault).
   */
  async tokenizePosition(originalPosition: PublicKey): Promise<string> {
    const info = await this.connection.getAccountInfo(originalPosition);
    if (!info) throw new Error("position account not found");
    const protocol = protocolForProgram(info.owner);
    // Every Sigma position stores its pool / vault right after the owner (bytes 40..72)
    const positionPool = new PublicKey(info.data.subarray(40, 72));
    const [positionToken] = findPositionTokenPDA(originalPosition);

    return this.program.methods
      .tokenizePosition({ [protocol]: {} })
      .accounts({
        owner: this.provider.wallet.publicKey,
        positionAccount: originalPosition,
        positionPool,
        protocolProgram: info.owner,
        positionToken,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Take the underlying position back out of custody and close the position
   * token. The wallet must hold the token and it must not be listed.
   */
  async redeemPosition(originalPosition: PublicKey): Promise<string> {
    const [positionToken] = findPositionTokenPDA(originalPosition);
    const info = await this.connection.getAccountInfo(originalPosition);
    if (!info) throw new Error("position account not found");

    return this.program.methods
      .redeemPosition()
      .accounts({
        owner: this.provider.wallet.publicKey,
        positionToken,
        positionAccount: originalPosition,
        protocolProgram: info.owner,
      })
      .rpc();
  }

  /**
   * List a position for sale
   */
  async listPosition(
    positionToken: PublicKey,
    price: BN,
    minPrice: BN = new BN(0),
    listingExpiry: BN = new BN(0)
  ): Promise<string> {
    const token = await (this.program.account as any).positionToken.fetch(positionToken);
    const [secondaryMarket] = findSecondaryMarketPDA(protocolName(token.protocol));

    return this.program.methods
      .listPosition(price, minPrice, listingExpiry)
      .accounts({
        owner: this.provider.wallet.publicKey,
        positionToken,
        secondaryMarket,
      })
      .rpc();
  }

  /**
   * Buy a listed position, paying at most `maxPrice` in the market's quote
   * mint from the wallet's associated token account. The seller's and fee
   * recipient's associated token accounts are created if missing.
   */
  async buyPosition(
    positionToken: PublicKey,
    maxPrice: BN
  ): Promise<string> {
    const token = await (this.program.account as any).positionToken.fetch(positionToken);
    const [secondaryMarket] = findSecondaryMarketPDA(protocolName(token.protocol));
    const market = await (this.program.account as any).secondaryMarket.fetch(secondaryMarket);
    const buyer = this.provider.wallet.publicKey;
    const mint: PublicKey = market.quoteMint;

    const sellerTokenAccount = getAssociatedTokenAddressSync(mint, token.owner, true);
    const feeRecipientTokenAccount = getAssociatedTokenAddressSync(mint, market.feeRecipient, true);

    return this.program.methods
      .buyPosition(maxPrice)
      .accounts({
        buyer,
        positionToken,
        secondaryMarket,
        positionAccount: token.positionAccount,
        buyerTokenAccount: getAssociatedTokenAddressSync(mint, buyer, true),
        sellerTokenAccount,
        feeRecipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(buyer, sellerTokenAccount, token.owner, mint),
        createAssociatedTokenAccountIdempotentInstruction(buyer, feeRecipientTokenAccount, market.feeRecipient, mint),
      ])
      .rpc();
  }

  /**
   * Fetch a position token account
   */
  async getPositionToken(originalPosition: PublicKey): Promise<PositionToken | null> {
    const [positionToken] = findPositionTokenPDA(originalPosition);
    try {
      return await (this.program.account as any).positionToken.fetch(positionToken) as unknown as PositionToken;
    } catch {
      return null;
    }
  }
}
