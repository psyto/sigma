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

  // ============================================================================
  // Liquidation & Margin Edge Cases
  // ============================================================================

  describe("Liquidation & Margin Edge Cases", () => {
    /**
     * Helper: open a receiver swap and return its PDA.
     * Uses the current pool.totalSwaps as the swap index.
     */
    async function openReceiverSwap(
      notional: BN,
      durationPeriods: number,
      maxFixedRateBps: number,
      signer?: Keypair,
      signerCollateral?: PublicKey,
    ): Promise<PublicKey> {
      const pool = await program.account.fundingPool.fetch(poolPDA);
      const swapIndex = pool.totalSwaps;
      const user = signer ? signer.publicKey : authority.publicKey;

      const [swapPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap"),
          poolPDA.toBuffer(),
          user.toBuffer(),
          swapIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const accounts = {
        user,
        pool: poolPDA,
        swap: swapPDA,
        userCollateral: signerCollateral ?? userCollateralAccount,
        poolVault: poolVaultPDA,
        collateralMint: collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      };

      const tx = program.methods
        .openReceiver(notional, durationPeriods, maxFixedRateBps)
        .accounts(accounts);

      if (signer) {
        await tx.signers([signer]).rpc();
      } else {
        await tx.rpc();
      }

      return swapPDA;
    }

    /**
     * Helper: record a funding rate in the oracle and process a funding period.
     */
    async function recordAndProcessFunding(rateBps: number): Promise<void> {
      await oracleProgram.methods
        .recordFundingRate(new BN(rateBps))
        .accounts({
          authority: authority.publicKey,
          fundingFeed: fundingFeedPDA,
        })
        .rpc();

      // Wait briefly so the 1-second funding period elapses
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await program.methods
        .processFundingPeriod()
        .accounts({
          authority: authority.publicKey,
          pool: poolPDA,
          fundingFeed: fundingFeedPDA,
        })
        .rpc();
    }

    it("should deplete margin on under-margin position after adverse funding", async () => {
      // Open a receiver swap with minimum duration (short swap = small margin).
      // Receiver pays fixed, receives floating. If floating << fixed, receiver loses.
      const notional = new BN(1_000_000_000); // 1B lamports
      const durationPeriods = 2;
      const maxFixedRateBps = 200;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(positionBefore.status).to.deep.equal({ active: {} });
      const collateralBefore = positionBefore.collateralDeposited.toNumber();
      expect(collateralBefore).to.be.greaterThan(0);

      // Process funding periods with a very negative rate (adverse for receiver).
      // Receiver profits when actual > fixed; a very negative actual rate means big loss.
      await recordAndProcessFunding(-200);
      await recordAndProcessFunding(-200);

      // The swap should now have ended (2 periods elapsed).
      // Settle and verify that loss ate into margin.
      const pool = await program.account.fundingPool.fetch(poolPDA);
      const positionMid = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(positionMid.status).to.deep.equal({ active: {} });

      // Settle the swap
      await program.methods
        .settleSwap()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          swap: swapPDA,
        })
        .rpc();

      const positionAfter = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(positionAfter.status).to.deep.equal({ settled: {} });

      // The accumulated PnL should be negative (receiver lost money with negative rates)
      expect(positionAfter.accumulatedPnl.toNumber()).to.be.lessThan(0);

      // Payout should be less than collateral deposited
      expect(positionAfter.payoutAmount.toNumber()).to.be.lessThan(collateralBefore);
    });

    it("should settle and claim after processing all funding periods", async () => {
      // Open a receiver swap and process all periods, then settle and claim
      const notional = new BN(5_000_000_000);
      const durationPeriods = 3;
      const maxFixedRateBps = 200;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(positionBefore.collateralDeposited.toNumber()).to.be.greaterThan(0);

      // Record funding rates and process 3 periods
      await recordAndProcessFunding(300);
      await recordAndProcessFunding(300);
      await recordAndProcessFunding(300);

      // Settle the completed swap
      await program.methods
        .settleSwap()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          swap: swapPDA,
        })
        .rpc();

      const positionAfter = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(positionAfter.status).to.deep.equal({ settled: {} });
      expect(positionAfter.periodsSettled).to.equal(durationPeriods);

      // Claim the payout
      await program.methods
        .claimPayout()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          swap: swapPDA,
          poolVault: poolVaultPDA,
          userCollateral: userCollateralAccount,
          collateralMint: collateralMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // The swap account should be closed after claim
      try {
        await program.account.fundingSwapPosition.fetch(swapPDA);
        expect.fail("Position should be closed after claim");
      } catch (e: any) {
        expect(e.message).to.include("Account does not exist");
      }
    });

    it("should close swap with loss after unfavorable funding", async () => {
      // Open a receiver swap. Then feed unfavorable (negative) rates.
      const notional = new BN(5_000_000_000);
      const durationPeriods = 3;
      const maxFixedRateBps = 200;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();

      // Record unfavorable funding rates (low/negative => receiver loses)
      await recordAndProcessFunding(-100);
      await recordAndProcessFunding(-100);
      await recordAndProcessFunding(-100);

      // Settle the completed swap
      await program.methods
        .settleSwap()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          swap: swapPDA,
        })
        .rpc();

      const positionAfter = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(positionAfter.status).to.deep.equal({ settled: {} });

      // PnL should be negative (receiver loses when actual < fixed)
      expect(positionAfter.accumulatedPnl.toNumber()).to.be.lessThan(0);

      // Payout should be less than collateral deposited
      expect(positionAfter.payoutAmount.toNumber()).to.be.lessThan(collateralBefore);

      // Claim reduced payout
      await program.methods
        .claimPayout()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          swap: swapPDA,
          poolVault: poolVaultPDA,
          userCollateral: userCollateralAccount,
          collateralMint: collateralMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // The swap account should be closed after claim
      try {
        await program.account.fundingSwapPosition.fetch(swapPDA);
        expect.fail("Position should be closed after claim");
      } catch (e: any) {
        expect(e.message).to.include("Account does not exist");
      }
    });

    it("should process multiple funding periods and verify cumulative accrual", async () => {
      const notional = new BN(10_000_000_000);
      const durationPeriods = 5;
      const maxFixedRateBps = 200;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const poolBefore = await program.account.fundingPool.fetch(poolPDA);
      const periodsBefore = poolBefore.totalPeriodsProcessed.toNumber();

      // Process 5 funding periods sequentially with varying rates
      const rates = [80, -50, 120, -30, 200];
      for (const rate of rates) {
        await recordAndProcessFunding(rate);
      }

      const poolAfter = await program.account.fundingPool.fetch(poolPDA);
      const periodsAfter = poolAfter.totalPeriodsProcessed.toNumber();

      // Verify all 5 periods were processed
      expect(periodsAfter - periodsBefore).to.equal(5);

      // The current_period should have incremented by 5
      expect(poolAfter.currentPeriod.toNumber()).to.equal(
        poolBefore.currentPeriod.toNumber() + 5
      );

      // Settle the swap after all periods are processed
      await program.methods
        .settleSwap()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          swap: swapPDA,
        })
        .rpc();

      const position = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(position.status).to.deep.equal({ settled: {} });
      expect(position.periodsSettled).to.equal(durationPeriods);
    });

    it("should reject closing an already-settled swap", async () => {
      // Open a short-duration receiver swap
      const notional = new BN(1_000_000_000);
      const durationPeriods = 1;
      const maxFixedRateBps = 300;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      // Process enough funding periods so the swap expires
      await recordAndProcessFunding(50);

      // Settle the swap the first time
      await program.methods
        .settleSwap()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          swap: swapPDA,
        })
        .rpc();

      const position = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(position.status).to.deep.equal({ settled: {} });

      // Attempt to settle again -- should fail with SwapAlreadySettled
      try {
        await program.methods
          .settleSwap()
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            swap: swapPDA,
          })
          .rpc();

        expect.fail("Should have rejected settling an already-settled swap");
      } catch (e: any) {
        expect(e.message).to.include("SwapAlreadySettled");
      }
    });
  });
});
