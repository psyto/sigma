import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { ensureConfig } from "./config";

/**
 * A funding-swap pool owned by the provider wallet, for tests that need real
 * position accounts (e.g. shared-oracle's tokenize_position).
 */
export class FundingSwapFixture {
  private provider: anchor.AnchorProvider;
  private program: any;
  private oracle: any;
  readonly marketSymbol: string;
  collateralMint!: PublicKey;
  userCollateral!: PublicKey;
  pool!: PublicKey;
  poolVault!: PublicKey;

  constructor(marketSymbol: string) {
    this.provider = anchor.AnchorProvider.env();
    this.program = anchor.workspace.FundingSwap;
    this.oracle = anchor.workspace.SharedOracle;
    this.marketSymbol = marketSymbol;
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  async fetchPosition(position: PublicKey): Promise<any> {
    return this.program.account.fundingSwapPosition.fetch(position);
  }

  async setup(): Promise<void> {
    const payer = (this.provider.wallet as any).payer as Keypair;
    const wallet = this.provider.wallet.publicKey;
    const oracleConfig = await ensureConfig(this.oracle, "oracle_config", "initializeOracleConfig");
    const config = await ensureConfig(this.program, "config", "initializeConfig");

    const [fundingFeed] = PublicKey.findProgramAddressSync(
      [Buffer.from("funding_feed"), Buffer.from(this.marketSymbol)],
      this.oracle.programId
    );
    await this.oracle.methods
      .initializeFundingFeed(this.marketSymbol, new BN(28800))
      .accounts({
        oracleConfig,
        authority: wallet,
        fundingFeed,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    this.collateralMint = await createMint(this.provider.connection, payer, wallet, null, 6);
    this.userCollateral = (
      await getOrCreateAssociatedTokenAccount(this.provider.connection, payer, this.collateralMint, wallet)
    ).address;
    await mintTo(this.provider.connection, payer, this.collateralMint, this.userCollateral, payer, 1_000_000_000_000);

    [this.pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("funding_pool"), Buffer.from(this.marketSymbol)],
      this.program.programId
    );
    [this.poolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_vault"), this.pool.toBuffer()],
      this.program.programId
    );
    await this.program.methods
      .initializePool({
        marketSymbol: this.marketSymbol,
        fundingPeriodSeconds: new BN(3600), // stored expiry (open time + term) lands hours ahead
        minNotional: new BN(1_000_000_000),
        maxNotional: new BN(1_000_000_000_000),
        maxDurationPeriods: 90,
        feeRateBps: 30,
        initialFixedRateBps: 50,
        earlyExitPenaltyBps: 500,
      })
      .accounts({
        config,
        authority: wallet,
        collateralMint: this.collateralMint,
        fundingFeed,
        pool: this.pool,
        poolVault: this.poolVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const [lpAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), this.pool.toBuffer(), wallet.toBuffer()],
      this.program.programId
    );
    await this.program.methods
      .depositLiquidity(new BN(100_000_000_000))
      .accounts({
        user: wallet,
        pool: this.pool,
        lpAccount,
        userCollateral: this.userCollateral,
        poolVault: this.poolVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /** Open a receiver swap owned by the provider wallet; returns the position account. */
  async openReceiver(notional: BN = new BN(5_000_000_000)): Promise<PublicKey> {
    const wallet = this.provider.wallet.publicKey;
    const pool = await this.program.account.fundingPool.fetch(this.pool);
    const [swap] = PublicKey.findProgramAddressSync(
      [Buffer.from("swap"), this.pool.toBuffer(), wallet.toBuffer(), pool.totalSwaps.toArrayLike(Buffer, "le", 8)],
      this.program.programId
    );
    await this.program.methods
      .openReceiver(notional, 10, 100)
      .accounts({
        user: wallet,
        pool: this.pool,
        swap,
        userCollateral: this.userCollateral,
        poolVault: this.poolVault,
        collateralMint: this.collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return swap;
  }
}
