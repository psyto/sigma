import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  PROGRAM_IDS,
  FundingPool,
  FundingSwapPosition,
  LiquidityProvider,
} from "./types";
import {
  findFundingPoolPDA,
  findFundingPoolVaultPDA,
  findFundingSwapPositionPDA,
  findFundingSwapLpAccountPDA,
  findFundingFeedPDA,
} from "./utils";

export interface FundingPoolParams {
  swapDurationSeconds: BN;
  minNotional: BN;
  maxNotional: BN;
  feeRateBps: number;
  maxRateSpreadBps: number;
}

/**
 * Client for interacting with the Sigma FundingSwap program
 */
export class FundingSwapClient {
  private program: Program;
  private provider: AnchorProvider;

  constructor(provider: AnchorProvider, idl?: Idl) {
    this.provider = provider;
    this.program = new Program(idl, provider);
  }

  get connection(): Connection {
    return this.provider.connection;
  }

  get programId(): PublicKey {
    return PROGRAM_IDS.FUNDING_SWAP;
  }

  // ============================================================================
  // Pool Methods
  // ============================================================================

  /**
   * Initialize a new funding swap pool
   */
  async initializePool(
    marketSymbol: string,
    collateralMint: PublicKey,
    params: FundingPoolParams
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [poolVault] = findFundingPoolVaultPDA(pool);
    const [fundingFeed] = findFundingFeedPDA(marketSymbol);

    return this.program.methods
      .initializePool(marketSymbol, params)
      .accounts({
        authority: this.provider.wallet.publicKey,
        collateralMint,
        fundingFeed,
        pool,
        poolVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Update pool parameters
   */
  async updatePool(
    marketSymbol: string,
    feeRateBps: number | null,
    minNotional: BN | null,
    maxNotional: BN | null,
    maxRateSpreadBps: number | null
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);

    return this.program.methods
      .updatePool(feeRateBps, minNotional, maxNotional, maxRateSpreadBps)
      .accounts({
        authority: this.provider.wallet.publicKey,
        pool,
      })
      .rpc();
  }

  /**
   * Fetch a pool account
   */
  async getPool(marketSymbol: string): Promise<FundingPool | null> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    try {
      return await (this.program.account as any).fundingPool.fetch(pool) as unknown as FundingPool;
    } catch {
      return null;
    }
  }

  /**
   * Get all funding pools
   */
  async getAllPools(): Promise<{ publicKey: PublicKey; account: FundingPool }[]> {
    try {
      const accounts = await (this.program.account as any).fundingPool.all();
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as FundingPool,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get pool address
   */
  getPoolAddress(marketSymbol: string): PublicKey {
    return findFundingPoolPDA(marketSymbol)[0];
  }

  // ============================================================================
  // Position Methods
  // ============================================================================

  /**
   * Open a receive-fixed swap position
   * You receive fixed rate and pay floating (funding rate)
   */
  async openReceiveFixed(
    marketSymbol: string,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    notional: BN,
    fixedRateBps: BN,
    swapId: BN
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [poolVault] = findFundingPoolVaultPDA(pool);
    const [position] = findFundingSwapPositionPDA(
      pool,
      this.provider.wallet.publicKey,
      swapId
    );

    return this.program.methods
      .openReceiveFixed(notional, fixedRateBps, swapId)
      .accounts({
        user: this.provider.wallet.publicKey,
        pool,
        position,
        userCollateral,
        poolVault,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Open a pay-fixed swap position
   * You pay fixed rate and receive floating (funding rate)
   */
  async openPayFixed(
    marketSymbol: string,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    notional: BN,
    fixedRateBps: BN,
    swapId: BN
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [poolVault] = findFundingPoolVaultPDA(pool);
    const [position] = findFundingSwapPositionPDA(
      pool,
      this.provider.wallet.publicKey,
      swapId
    );

    return this.program.methods
      .openPayFixed(notional, fixedRateBps, swapId)
      .accounts({
        user: this.provider.wallet.publicKey,
        pool,
        position,
        userCollateral,
        poolVault,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Record a funding payment for a position
   */
  async recordFundingPayment(
    marketSymbol: string,
    positionOwner: PublicKey,
    swapId: BN
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [fundingFeed] = findFundingFeedPDA(marketSymbol);
    const [position] = findFundingSwapPositionPDA(pool, positionOwner, swapId);

    return this.program.methods
      .recordFundingPayment()
      .accounts({
        authority: this.provider.wallet.publicKey,
        pool,
        position,
        fundingFeed,
      })
      .rpc();
  }

  /**
   * Settle a swap at expiry
   */
  async settleSwap(
    marketSymbol: string,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    swapId: BN
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [poolVault] = findFundingPoolVaultPDA(pool);
    const [position] = findFundingSwapPositionPDA(
      pool,
      this.provider.wallet.publicKey,
      swapId
    );

    return this.program.methods
      .settleSwap()
      .accounts({
        user: this.provider.wallet.publicKey,
        pool,
        position,
        userCollateral,
        poolVault,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Close a swap position early
   */
  async closeSwapEarly(
    marketSymbol: string,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    swapId: BN
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [poolVault] = findFundingPoolVaultPDA(pool);
    const [position] = findFundingSwapPositionPDA(
      pool,
      this.provider.wallet.publicKey,
      swapId
    );

    return this.program.methods
      .closeSwapEarly()
      .accounts({
        user: this.provider.wallet.publicKey,
        pool,
        position,
        userCollateral,
        poolVault,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Fetch a position account
   */
  async getPosition(
    marketSymbol: string,
    user: PublicKey,
    swapId: BN
  ): Promise<FundingSwapPosition | null> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [position] = findFundingSwapPositionPDA(pool, user, swapId);
    try {
      return await (this.program.account as any).fundingSwapPosition.fetch(position) as unknown as FundingSwapPosition;
    } catch {
      return null;
    }
  }

  /**
   * Get all positions for a user in a pool
   */
  async getUserPositions(
    marketSymbol: string,
    user: PublicKey
  ): Promise<FundingSwapPosition[]> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const accounts = await (this.program.account as any).fundingSwapPosition.all([
      {
        memcmp: {
          offset: 8, // After discriminator
          bytes: user.toBase58(),
        },
      },
      {
        memcmp: {
          offset: 8 + 32, // After discriminator + owner
          bytes: pool.toBase58(),
        },
      },
    ]);
    return accounts.map((a: any) => a.account as FundingSwapPosition);
  }

  /**
   * Get all positions for a user across all pools
   */
  async getAllUserPositions(
    user: PublicKey
  ): Promise<{ publicKey: PublicKey; account: FundingSwapPosition }[]> {
    try {
      const accounts = await (this.program.account as any).fundingSwapPosition.all([
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: user.toBase58(),
          },
        },
      ]);
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as FundingSwapPosition,
      }));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Liquidity Methods
  // ============================================================================

  /**
   * Deposit liquidity to the pool
   */
  async depositLiquidity(
    marketSymbol: string,
    userCollateral: PublicKey,
    amount: BN
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [poolVault] = findFundingPoolVaultPDA(pool);
    const [lpAccount] = findFundingSwapLpAccountPDA(
      pool,
      this.provider.wallet.publicKey
    );

    return this.program.methods
      .depositLiquidity(amount)
      .accounts({
        user: this.provider.wallet.publicKey,
        pool,
        lpAccount,
        userCollateral,
        poolVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Withdraw liquidity from the pool
   */
  async withdrawLiquidity(
    marketSymbol: string,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    shares: BN
  ): Promise<string> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [poolVault] = findFundingPoolVaultPDA(pool);
    const [lpAccount] = findFundingSwapLpAccountPDA(
      pool,
      this.provider.wallet.publicKey
    );

    return this.program.methods
      .withdrawLiquidity(shares)
      .accounts({
        user: this.provider.wallet.publicKey,
        pool,
        lpAccount,
        userCollateral,
        poolVault,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Fetch an LP account
   */
  async getLpAccount(
    marketSymbol: string,
    user: PublicKey
  ): Promise<LiquidityProvider | null> {
    const [pool] = findFundingPoolPDA(marketSymbol);
    const [lpAccount] = findFundingSwapLpAccountPDA(pool, user);
    try {
      return await (this.program.account as any).liquidityProvider.fetch(lpAccount) as unknown as LiquidityProvider;
    } catch {
      return null;
    }
  }
}
