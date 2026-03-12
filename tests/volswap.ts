import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

type Volswap = any;

describe("volswap", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Volswap as Program<Volswap>;
  const oracleProgram = anchor.workspace.SharedOracle;

  const authority = provider.wallet;
  let collateralMint: PublicKey;
  let underlyingMint: Keypair;
  let priceFeedPDA: PublicKey;
  let varianceTrackerPDA: PublicKey;
  let poolPDA: PublicKey;
  let poolVaultPDA: PublicKey;
  let userCollateralAccount: PublicKey;

  before(async () => {
    // Create collateral mint (USDC-like)
    collateralMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      authority.publicKey,
      null,
      6 // 6 decimals like USDC
    );

    // Create underlying asset mint (SOL-like)
    underlyingMint = Keypair.generate();

    // Initialize price feed in oracle program
    [priceFeedPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("price_feed"), underlyingMint.publicKey.toBuffer()],
      oracleProgram.programId
    );

    const [sampleBufferPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("sample_buffer"), priceFeedPDA.toBuffer()],
      oracleProgram.programId
    );

    try {
      await oracleProgram.methods
        .initializePriceFeed("SOL", new BN(1), 360)
        .accounts({
          authority: authority.publicKey,
          assetMint: underlyingMint.publicKey,
          priceFeed: priceFeedPDA,
          sampleBuffer: sampleBufferPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // May already exist
      console.log("Price feed may already exist");
    }

    // Initialize variance tracker
    [varianceTrackerPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("variance_tracker"), priceFeedPDA.toBuffer()],
      oracleProgram.programId
    );

    try {
      await oracleProgram.methods
        .initializeVarianceTracker(new BN(604800))
        .accounts({
          authority: authority.publicKey,
          priceFeed: priceFeedPDA,
          varianceTracker: varianceTrackerPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      console.log("Variance tracker may already exist");
    }

    // Create user's collateral token account
    userCollateralAccount = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as any).payer,
      collateralMint,
      authority.publicKey
    );

    // Mint some collateral to user
    await mintTo(
      provider.connection,
      (provider.wallet as any).payer,
      collateralMint,
      userCollateralAccount,
      authority.publicKey,
      1_000_000_000_000 // 1,000,000 USDC
    );
  });

  // ============================================================================
  // Pool Initialization Tests
  // ============================================================================

  describe("Pool Initialization", () => {
    it("should initialize a variance swap pool", async () => {
      const poolParams = {
        epochDurationSeconds: new BN(10), // 10 seconds for testing
        minNotional: new BN(100_000_000), // $100
        maxNotional: new BN(100_000_000_000), // $100,000
        feeRateBps: 50, // 0.5%
        initialStrikeVarianceBps: new BN(3500), // 35%
        varianceCapBps: new BN(20000), // 200%
        earlyExitPenaltyBps: 500, // 5%
      };

      [poolPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("variance_pool"), underlyingMint.publicKey.toBuffer()],
        program.programId
      );

      [poolVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_vault"), poolPDA.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .initializePool(poolParams)
          .accounts({
            authority: authority.publicKey,
            collateralMint: collateralMint,
            underlyingMint: underlyingMint.publicKey,
            priceFeed: priceFeedPDA,
            varianceTracker: varianceTrackerPDA,
            pool: poolPDA,
            poolVault: poolVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const pool = await program.account.variancePool.fetch(poolPDA);
        expect(pool.authority.toString()).to.equal(authority.publicKey.toString());
        expect(pool.isActive).to.be.true;
        expect(pool.currentEpoch.toNumber()).to.equal(1);
      } catch (e) {
        console.log("Initialize pool error:", e);
        throw e;
      }
    });

    it("should update pool parameters", async () => {
      const newFeeRateBps = 75; // 0.75%
      const newMinNotional = new BN(50_000_000); // $50

      try {
        await program.methods
          .updatePool(newFeeRateBps, newMinNotional, null, null)
          .accounts({
            authority: authority.publicKey,
            pool: poolPDA,
          })
          .rpc();

        const pool = await program.account.variancePool.fetch(poolPDA);
        expect(pool.feeRateBps).to.equal(75);
        expect(pool.minNotional.toNumber()).to.equal(50_000_000);
      } catch (e) {
        console.log("Update pool error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Liquidity Provider Tests
  // ============================================================================

  describe("Liquidity Provision", () => {
    let lpAccountPDA: PublicKey;

    it("should deposit liquidity to pool", async () => {
      const depositAmount = new BN(100_000_000_000); // $100,000

      [lpAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .depositLiquidity(depositAmount)
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            lpAccount: lpAccountPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const lpAccount = await program.account.liquidityProvider.fetch(lpAccountPDA);
        expect(lpAccount.totalDeposited.toNumber()).to.equal(100_000_000_000);
      } catch (e) {
        console.log("Deposit liquidity error:", e);
        throw e;
      }
    });

    it("should withdraw liquidity from pool", async () => {
      const withdrawShares = new BN(50_000_000_000); // Half

      try {
        await program.methods
          .withdrawLiquidity(withdrawShares)
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            lpAccount: lpAccountPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        const lpAccount = await program.account.liquidityProvider.fetch(lpAccountPDA);
        // Shares should be reduced
        expect(lpAccount.shares.toNumber()).to.be.lessThan(100_000_000_000);
      } catch (e) {
        console.log("Withdraw liquidity error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Position Tests
  // ============================================================================

  describe("Positions", () => {
    let positionPDA: PublicKey;
    let currentEpoch: BN;

    before(async () => {
      const pool = await program.account.variancePool.fetch(poolPDA);
      currentEpoch = pool.currentEpoch;
    });

    it("should open a long variance position", async () => {
      const notional = new BN(10_000_000_000); // $10,000
      const maxPremium = new BN(500_000_000); // $500 max premium

      [positionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          currentEpoch.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openLong(notional, maxPremium)
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            position: positionPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const position = await program.account.variancePosition.fetch(positionPDA);
        expect(position.isLong).to.be.true;
        expect(position.notional.toNumber()).to.equal(10_000_000_000);
        expect(position.status).to.deep.equal({ active: {} });
      } catch (e) {
        console.log("Open long position error:", e);
        throw e;
      }
    });

    it("should close position early with penalty", async () => {
      try {
        await program.methods
          .closePositionEarly()
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            position: positionPDA,
            poolVault: poolVaultPDA,
            userCollateral: userCollateralAccount,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        // Position should be closed (account no longer exists)
        try {
          await program.account.variancePosition.fetch(positionPDA);
          expect.fail("Position should be closed");
        } catch (e: any) {
          expect(e.message).to.include("Account does not exist");
        }
      } catch (e) {
        console.log("Close position early error:", e);
        throw e;
      }
    });

    it("should open a short variance position", async () => {
      const notional = new BN(5_000_000_000); // $5,000
      const minPremium = new BN(1); // Minimal premium threshold

      // Create new position PDA (use different user or increment epoch)
      const newUser = Keypair.generate();

      // Airdrop SOL to new user
      const sig = await provider.connection.requestAirdrop(
        newUser.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      // Create token account for new user
      const newUserCollateral = await createAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as any).payer,
        collateralMint,
        newUser.publicKey
      );

      // Mint collateral to new user
      await mintTo(
        provider.connection,
        (provider.wallet as any).payer,
        collateralMint,
        newUserCollateral,
        authority.publicKey,
        10_000_000_000 // $10,000
      );

      const [shortPositionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          poolPDA.toBuffer(),
          newUser.publicKey.toBuffer(),
          currentEpoch.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openShort(notional, minPremium)
          .accounts({
            user: newUser.publicKey,
            pool: poolPDA,
            position: shortPositionPDA,
            userCollateral: newUserCollateral,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([newUser])
          .rpc();

        const position = await program.account.variancePosition.fetch(shortPositionPDA);
        expect(position.isLong).to.be.false;
        expect(position.notional.toNumber()).to.equal(5_000_000_000);
      } catch (e) {
        console.log("Open short position error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Epoch Settlement Tests
  // ============================================================================

  describe("Epoch Settlement", () => {
    it("should settle an epoch", async () => {
      // Wait for epoch to end
      await new Promise((resolve) => setTimeout(resolve, 11000));

      try {
        await program.methods
          .settleEpoch()
          .accounts({
            authority: authority.publicKey,
            pool: poolPDA,
            varianceTracker: varianceTrackerPDA,
          })
          .rpc();

        const pool = await program.account.variancePool.fetch(poolPDA);
        expect(pool.isEpochSettled).to.be.true;
      } catch (e) {
        console.log("Settle epoch error:", e);
        throw e;
      }
    });

    it("should start a new epoch", async () => {
      const newStrikeVarianceBps = new BN(4000); // 40%

      try {
        await program.methods
          .startNewEpoch(newStrikeVarianceBps)
          .accounts({
            authority: authority.publicKey,
            pool: poolPDA,
          })
          .rpc();

        const pool = await program.account.variancePool.fetch(poolPDA);
        expect(pool.currentEpoch.toNumber()).to.equal(2);
        expect(pool.isEpochSettled).to.be.false;
        expect(pool.strikeVarianceBps.toNumber()).to.equal(4000);
      } catch (e) {
        console.log("Start new epoch error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Error Cases
  // ============================================================================

  describe("Error Cases", () => {
    it("should reject position below minimum notional", async () => {
      const pool = await program.account.variancePool.fetch(poolPDA);
      const notional = new BN(10_000_000); // $10, below minimum
      const maxPremium = new BN(1_000_000);

      const [positionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          pool.currentEpoch.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openLong(notional, maxPremium)
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            position: positionPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have rejected due to low notional");
      } catch (e: any) {
        expect(e.message).to.include("NotionalTooLow");
      }
    });

    it("should reject unauthorized pool updates", async () => {
      const unauthorizedUser = Keypair.generate();

      try {
        await program.methods
          .updatePool(100, null, null, null)
          .accounts({
            authority: unauthorizedUser.publicKey,
            pool: poolPDA,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Should have rejected unauthorized update");
      } catch (e: any) {
        expect(e.message).to.include("Unauthorized");
      }
    });
  });
});
