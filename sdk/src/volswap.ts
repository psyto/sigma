import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  PROGRAM_IDS,
  VariancePool,
  VariancePosition,
  LiquidityProvider,
} from "./types";
import {
  findVariancePoolPDA,
  findPoolVaultPDA,
  findVariancePositionPDA,
  findVolswapLpAccountPDA,
  findPriceFeedPDA,
  findVarianceTrackerPDA,
} from "./utils";

export interface PoolParams {
  epochDurationSeconds: BN;
  minNotional: BN;
  maxNotional: BN;
  feeRateBps: number;
  initialStrikeVarianceBps: BN;
  varianceCapBps: BN;
  earlyExitPenaltyBps: number;
}

/**
 * Client for interacting with the Sigma Volswap program
 */
export class VolswapClient {
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
    return PROGRAM_IDS.VOLSWAP;
  }

  // ============================================================================
  // Pool Methods
  // ============================================================================

  /**
   * Initialize a new variance swap pool
   */
  async initializePool(
    collateralMint: PublicKey,
    underlyingMint: PublicKey,
    params: PoolParams
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [poolVault] = findPoolVaultPDA(pool);
    const [priceFeed] = findPriceFeedPDA(underlyingMint);
    const [varianceTracker] = findVarianceTrackerPDA(priceFeed);

    return this.program.methods
      .initializePool(params)
      .accounts({
        authority: this.provider.wallet.publicKey,
        collateralMint,
        underlyingMint,
        priceFeed,
        varianceTracker,
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
    underlyingMint: PublicKey,
    feeRateBps: number | null,
    minNotional: BN | null,
    maxNotional: BN | null,
    earlyExitPenaltyBps: number | null
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);

    return this.program.methods
      .updatePool(feeRateBps, minNotional, maxNotional, earlyExitPenaltyBps)
      .accounts({
        authority: this.provider.wallet.publicKey,
        pool,
      })
      .rpc();
  }

  /**
   * Fetch a pool account
   */
  async getPool(underlyingMint: PublicKey): Promise<VariancePool | null> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    try {
      return await (this.program.account as any).variancePool.fetch(pool) as unknown as VariancePool;
    } catch {
      return null;
    }
  }

  /**
   * Get all variance pools
   */
  async getAllPools(): Promise<{ publicKey: PublicKey; account: VariancePool }[]> {
    try {
      const accounts = await (this.program.account as any).variancePool.all();
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as VariancePool,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get pool address
   */
  getPoolAddress(underlyingMint: PublicKey): PublicKey {
    return findVariancePoolPDA(underlyingMint)[0];
  }

  // ============================================================================
  // Position Methods
  // ============================================================================

  /**
   * Open a long variance position (profit when realized vol > strike)
   */
  async openLong(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    notional: BN,
    maxPremium: BN
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [poolVault] = findPoolVaultPDA(pool);
    const poolData = await this.getPool(underlyingMint);
    if (!poolData) throw new Error("Pool not found");

    const [position] = findVariancePositionPDA(
      pool,
      this.provider.wallet.publicKey,
      poolData.currentEpoch
    );

    return this.program.methods
      .openLong(notional, maxPremium)
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
   * Open a short variance position (profit when realized vol < strike)
   */
  async openShort(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    notional: BN,
    minPremium: BN
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [poolVault] = findPoolVaultPDA(pool);
    const poolData = await this.getPool(underlyingMint);
    if (!poolData) throw new Error("Pool not found");

    const [position] = findVariancePositionPDA(
      pool,
      this.provider.wallet.publicKey,
      poolData.currentEpoch
    );

    return this.program.methods
      .openShort(notional, minPremium)
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
   * Close a position early (with penalty)
   */
  async closePositionEarly(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    epoch: BN
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [poolVault] = findPoolVaultPDA(pool);
    const [position] = findVariancePositionPDA(
      pool,
      this.provider.wallet.publicKey,
      epoch
    );

    return this.program.methods
      .closePositionEarly()
      .accounts({
        user: this.provider.wallet.publicKey,
        pool,
        position,
        poolVault,
        userCollateral,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Claim payout after epoch settlement
   */
  async claimPayout(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    epoch: BN
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [poolVault] = findPoolVaultPDA(pool);
    const [position] = findVariancePositionPDA(
      pool,
      this.provider.wallet.publicKey,
      epoch
    );

    return this.program.methods
      .claimPayout()
      .accounts({
        user: this.provider.wallet.publicKey,
        pool,
        position,
        poolVault,
        userCollateral,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Fetch a position account
   */
  async getPosition(
    underlyingMint: PublicKey,
    user: PublicKey,
    epoch: BN
  ): Promise<VariancePosition | null> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [position] = findVariancePositionPDA(pool, user, epoch);
    try {
      return await (this.program.account as any).variancePosition.fetch(position) as unknown as VariancePosition;
    } catch {
      return null;
    }
  }

  /**
   * Get all positions for a user
   */
  async getUserPositions(
    user: PublicKey
  ): Promise<{ publicKey: PublicKey; account: VariancePosition }[]> {
    try {
      const accounts = await (this.program.account as any).variancePosition.all([
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: user.toBase58(),
          },
        },
      ]);
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as VariancePosition,
      }));
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Epoch Methods
  // ============================================================================

  /**
   * Settle the current epoch
   */
  async settleEpoch(underlyingMint: PublicKey): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const poolData = await this.getPool(underlyingMint);
    if (!poolData) throw new Error("Pool not found");

    return this.program.methods
      .settleEpoch()
      .accounts({
        authority: this.provider.wallet.publicKey,
        pool,
        varianceTracker: poolData.varianceTracker,
      })
      .rpc();
  }

  /**
   * Start a new epoch
   */
  async startNewEpoch(
    underlyingMint: PublicKey,
    newStrikeVarianceBps: BN
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);

    return this.program.methods
      .startNewEpoch(newStrikeVarianceBps)
      .accounts({
        authority: this.provider.wallet.publicKey,
        pool,
      })
      .rpc();
  }

  // ============================================================================
  // Liquidity Methods
  // ============================================================================

  /**
   * Deposit liquidity to the pool
   */
  async depositLiquidity(
    underlyingMint: PublicKey,
    userCollateral: PublicKey,
    amount: BN
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [poolVault] = findPoolVaultPDA(pool);
    const [lpAccount] = findVolswapLpAccountPDA(pool, this.provider.wallet.publicKey);

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
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    shares: BN
  ): Promise<string> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [poolVault] = findPoolVaultPDA(pool);
    const [lpAccount] = findVolswapLpAccountPDA(pool, this.provider.wallet.publicKey);

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
    underlyingMint: PublicKey,
    user: PublicKey
  ): Promise<LiquidityProvider | null> {
    const [pool] = findVariancePoolPDA(underlyingMint);
    const [lpAccount] = findVolswapLpAccountPDA(pool, user);
    try {
      return await (this.program.account as any).liquidityProvider.fetch(lpAccount) as unknown as LiquidityProvider;
    } catch {
      return null;
    }
  }

  /**
   * Get all LP positions for a user
   */
  async getUserLPPositions(
    user: PublicKey
  ): Promise<{ publicKey: PublicKey; account: LiquidityProvider }[]> {
    try {
      const accounts = await (this.program.account as any).liquidityProvider.all([
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: user.toBase58(),
          },
        },
      ]);
      return accounts.map((a: any) => ({
        publicKey: a.publicKey,
        account: a.account as LiquidityProvider,
      }));
    } catch {
      return [];
    }
  }
}
