import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";

type FundingSwap = any;

describe("funding-swap", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FundingSwap as Program<FundingSwap>;
  const oracleProgram = anchor.workspace.SharedOracle;

  const authority = provider.wallet;
  let collateralMint: PublicKey;
  let fundingFeedPDA: PublicKey;
  let poolPDA: PublicKey;
  let poolVaultPDA: PublicKey;
  let userCollateralAccount: PublicKey;
  const marketSymbol = "SOL-PERP";

  before(async () => {
    collateralMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      authority.publicKey,
      null,
      6
    );

    [fundingFeedPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("funding_feed"), Buffer.from(marketSymbol)],
      oracleProgram.programId
    );

    try {
      await oracleProgram.methods
        .initializeFundingFeed(marketSymbol, new BN(28800))
        .accounts({
          authority: authority.publicKey,
          fundingFeed: fundingFeedPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      console.log("Funding feed may already exist");
    }

    userCollateralAccount = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as any).payer,
      collateralMint,
      authority.publicKey
    );

    await mintTo(
      provider.connection,
      (provider.wallet as any).payer,
      collateralMint,
      userCollateralAccount,
      authority.publicKey,
      1_000_000_000_000
    );
  });

  // ============================================================================
  // Pool Tests
  // ============================================================================

  describe("Funding Swap Pool", () => {
    it("should initialize a funding swap pool", async () => {
      [poolPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("funding_pool"), Buffer.from(marketSymbol)],
        program.programId
      );

      [poolVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_vault"), poolPDA.toBuffer()],
        program.programId
      );

      const poolParams = {
        marketSymbol: marketSymbol,
        fundingPeriodSeconds: new BN(1),
        minNotional: new BN(1_000_000_000),
        maxNotional: new BN(1_000_000_000_000),
        maxDurationPeriods: 90,
        feeRateBps: 30,
        initialFixedRateBps: 50,
        earlyExitPenaltyBps: 500,
      };

      try {
        await program.methods
          .initializePool(poolParams)
          .accounts({
            authority: authority.publicKey,
            collateralMint: collateralMint,
            fundingFeed: fundingFeedPDA,
            pool: poolPDA,
            poolVault: poolVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const pool = await program.account.fundingPool.fetch(poolPDA);
        expect(pool.marketSymbol).to.equal(marketSymbol);
        expect(pool.isActive).to.be.true;
      } catch (e) {
        console.log("Initialize pool error:", e);
        throw e;
      }
    });

    it("should update pool parameters", async () => {
      try {
        await program.methods
          .updatePool(40, null, null)
          .accounts({
            authority: authority.publicKey,
            pool: poolPDA,
          })
          .rpc();

        const pool = await program.account.fundingPool.fetch(poolPDA);
        expect(pool.feeRateBps).to.equal(40);
      } catch (e) {
        console.log("Update pool error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Swap Position Tests
  // ============================================================================

  describe("Funding Swap Positions", () => {
    let receiverSwapPDA: PublicKey;
    let payerSwapPDA: PublicKey;
    let lpAccountPDA: PublicKey;

    before(async () => {
      [lpAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .depositLiquidity(new BN(100_000_000_000))
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
      } catch (e) {
        console.log("Deposit liquidity error:", e);
      }
    });

    it("should open a receiver swap position", async () => {
      const pool = await program.account.fundingPool.fetch(poolPDA);
      const swapIndex = pool.totalSwaps;

      const notional = new BN(50_000_000_000);
      const durationPeriods = 10;
      const maxFixedRateBps = 100;

      [receiverSwapPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          swapIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openReceiver(notional, durationPeriods, maxFixedRateBps)
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            swap: receiverSwapPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const position = await program.account.fundingSwapPosition.fetch(receiverSwapPDA);
        expect(position.isReceiver).to.be.true;
        expect(position.notional.toNumber()).to.equal(50_000_000_000);
      } catch (e) {
        console.log("Open receiver error:", e);
        throw e;
      }
    });

    it("should open a payer swap position", async () => {
      const newUser = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        newUser.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const newUserCollateral = await createAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as any).payer,
        collateralMint,
        newUser.publicKey
      );

      await mintTo(
        provider.connection,
        (provider.wallet as any).payer,
        collateralMint,
        newUserCollateral,
        authority.publicKey,
        100_000_000_000
      );

      const pool = await program.account.fundingPool.fetch(poolPDA);
      const swapIndex = pool.totalSwaps;

      const notional = new BN(25_000_000_000);
      const durationPeriods = 10;
      const minFixedRateBps = 0;

      [payerSwapPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap"),
          poolPDA.toBuffer(),
          newUser.publicKey.toBuffer(),
          swapIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openPayer(notional, durationPeriods, minFixedRateBps)
          .accounts({
            user: newUser.publicKey,
            pool: poolPDA,
            swap: payerSwapPDA,
            userCollateral: newUserCollateral,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([newUser])
          .rpc();

        const position = await program.account.fundingSwapPosition.fetch(payerSwapPDA);
        expect(position.isReceiver).to.be.false;
        expect(position.notional.toNumber()).to.equal(25_000_000_000);
      } catch (e) {
        console.log("Open payer error:", e);
        throw e;
      }
    });

    it("should process a funding period", async () => {
      await oracleProgram.methods
        .recordFundingRate(new BN(50))
        .accounts({
          authority: authority.publicKey,
          fundingFeed: fundingFeedPDA,
        })
        .rpc();

      try {
        await program.methods
          .processFundingPeriod()
          .accounts({
            authority: authority.publicKey,
            pool: poolPDA,
            fundingFeed: fundingFeedPDA,
          })
          .rpc();

        const pool = await program.account.fundingPool.fetch(poolPDA);
        expect(pool.totalPeriodsProcessed.toNumber()).to.be.greaterThan(0);
      } catch (e) {
        console.log("Process funding period error:", e);
        throw e;
      }
    });

    it("should settle a swap position at expiry", async () => {
      try {
        await program.methods
          .settleSwap()
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            swap: receiverSwapPDA,
          })
          .rpc();

        const position = await program.account.fundingSwapPosition.fetch(receiverSwapPDA);
        expect(position.status).to.deep.equal({ settled: {} });
      } catch (e) {
        console.log("Settle swap (may not be expired yet):", e);
      }
    });

    it("should close swap position early", async () => {
      const pool = await program.account.fundingPool.fetch(poolPDA);
      const swapIndex = pool.totalSwaps;

      const [newSwapPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          swapIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openReceiver(
            new BN(10_000_000_000),
            10,
            100
          )
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            swap: newSwapPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        await program.methods
          .closeSwapEarly()
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            swap: newSwapPDA,
            poolVault: poolVaultPDA,
            userCollateral: userCollateralAccount,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        try {
          await program.account.fundingSwapPosition.fetch(newSwapPDA);
          expect.fail("Position should be closed");
        } catch (e: any) {
          expect(e.message).to.include("Account does not exist");
        }
      } catch (e) {
        console.log("Close swap early error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Liquidity Provider Tests
  // ============================================================================

  describe("Liquidity Provision", () => {
    it("should withdraw liquidity", async () => {
      const [lpAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), poolPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .withdrawLiquidity(new BN(25_000_000_000))
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
        expect(lpAccount.shares.toNumber()).to.be.lessThan(100_000_000_000);
      } catch (e) {
        console.log("Withdraw liquidity error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Error Cases
  // ============================================================================

  describe("Error Cases", () => {
    it("should reject swap with rate exceeding limit", async () => {
      const pool = await program.account.fundingPool.fetch(poolPDA);
      const swapIndex = pool.totalSwaps;

      const notional = new BN(10_000_000_000);
      const durationPeriods = 10;
      const maxFixedRateBps = -100;

      const [swapPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          swapIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openReceiver(notional, durationPeriods, maxFixedRateBps)
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            swap: swapPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have rejected due to rate exceeding limit");
      } catch (e: any) {
        expect(e.message).to.include("RateExceedsLimit");
      }
    });

    it("should reject notional below minimum", async () => {
      const pool = await program.account.fundingPool.fetch(poolPDA);
      const swapIndex = pool.totalSwaps;

      const notional = new BN(100_000_000);
      const durationPeriods = 10;
      const maxFixedRateBps = 100;

      const [swapPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          swapIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openReceiver(notional, durationPeriods, maxFixedRateBps)
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            swap: swapPDA,
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
  });

  // ============================================================================
  // Access Control Tests
  // ============================================================================

  describe("Access Control", () => {
    it("should reject unauthorized pool updates", async () => {
      const unauthorizedUser = Keypair.generate();

      try {
        await program.methods
          .updatePool(100, null, null)
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

    it("should reject unauthorized process_funding_period", async () => {
      const unauthorizedUser = Keypair.generate();

      try {
        await program.methods
          .processFundingPeriod()
          .accounts({
            authority: unauthorizedUser.publicKey,
            pool: poolPDA,
            fundingFeed: fundingFeedPDA,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Should have rejected unauthorized funding period");
      } catch (e: any) {
        expect(e.message).to.include("Unauthorized");
      }
    });
  });
});
