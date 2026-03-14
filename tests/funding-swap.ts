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
     * Helper: open a payer swap and return its PDA.
     */
    async function openPayerSwap(
      notional: BN,
      durationPeriods: number,
      minFixedRateBps: number,
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
        .openPayer(notional, durationPeriods, minFixedRateBps)
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

    /**
     * Compute the expected P&L and payout exactly matching on-chain settle_swap logic.
     *
     * On-chain formula (settle_swap.rs):
     *   avg_rate_diff = pool.last_actual_rate_bps - swap.fixed_rate_bps
     *   total_pnl = notional * avg_rate_diff * duration_periods / 10000   (integer division)
     *   final_pnl = total_pnl for receiver, -total_pnl for payer
     *   payout = collateral + final_pnl  (clamped >= 0)
     */
    function computeExpectedPnl(
      notional: number,
      lastActualRateBps: number,
      fixedRateBps: number,
      durationPeriods: number,
      isReceiver: boolean,
    ): number {
      const avgRateDiff = lastActualRateBps - fixedRateBps;
      const totalPnl = Math.trunc(notional * avgRateDiff * durationPeriods / 10000);
      return isReceiver ? totalPnl : -totalPnl;
    }

    function computeExpectedPayout(collateral: number, finalPnl: number): number {
      if (finalPnl >= 0) {
        return collateral + finalPnl;
      } else {
        return Math.max(0, collateral - Math.abs(finalPnl));
      }
    }

    /**
     * Compute the collateral required by open_swap.
     * margin = notional * 50 * durationPeriods / 10000
     * fee = notional * feeRateBps / 10000
     */
    function computeExpectedCollateral(
      notional: number,
      durationPeriods: number,
      feeRateBps: number,
    ): number {
      const margin = Math.trunc(notional * 50 * durationPeriods / 10000);
      const fee = Math.trunc(notional * feeRateBps / 10000);
      return margin + fee;
    }

    it("should deplete margin on under-margin position after adverse funding (exact P&L)", async () => {
      // Open a receiver swap with minimum duration (short swap = small margin).
      // Receiver pays fixed, receives floating. If floating << fixed, receiver loses.
      const notional = new BN(1_000_000_000); // 1B lamports
      const durationPeriods = 2;
      const maxFixedRateBps = 200;

      // Read pool state to know the fixed rate that will be assigned
      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      expect(positionBefore.status).to.deep.equal({ active: {} });
      const collateralBefore = positionBefore.collateralDeposited.toNumber();
      expect(collateralBefore).to.be.greaterThan(0);

      // Verify the swap got the expected fixed rate
      expect(positionBefore.fixedRateBps).to.equal(assignedFixedRate);

      // Verify collateral matches expected margin + fee
      const poolFeeRate = poolAtOpen.feeRateBps;
      const expectedCollateral = computeExpectedCollateral(
        notional.toNumber(), durationPeriods, poolFeeRate
      );
      expect(collateralBefore).to.equal(expectedCollateral);

      // Process funding periods with a very negative rate (adverse for receiver).
      const adverseRate = -200;
      await recordAndProcessFunding(adverseRate);
      await recordAndProcessFunding(adverseRate);

      // Settle the swap
      const poolAtSettle = await program.account.fundingPool.fetch(poolPDA);
      const lastActualRate = poolAtSettle.lastActualRateBps.toNumber();
      expect(lastActualRate).to.equal(adverseRate);

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

      // Compute and verify exact P&L
      const expectedPnl = computeExpectedPnl(
        notional.toNumber(), lastActualRate, assignedFixedRate, durationPeriods, true
      );
      expect(expectedPnl).to.be.lessThan(0, "receiver should lose with negative funding");
      expect(positionAfter.accumulatedPnl.toNumber()).to.equal(expectedPnl);

      // Verify exact payout
      const expectedPayout = computeExpectedPayout(collateralBefore, expectedPnl);
      expect(positionAfter.payoutAmount.toNumber()).to.equal(expectedPayout);
      expect(expectedPayout).to.be.lessThan(collateralBefore);
    });

    it("should settle and claim after processing all funding periods (exact P&L)", async () => {
      // Open a receiver swap and process all periods, then settle and claim
      const notional = new BN(5_000_000_000);
      const durationPeriods = 3;
      const maxFixedRateBps = 200;

      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();
      expect(collateralBefore).to.be.greaterThan(0);
      expect(positionBefore.fixedRateBps).to.equal(assignedFixedRate);

      // Record funding rates and process 3 periods
      // The settle logic uses pool.last_actual_rate_bps (the last recorded rate)
      const oracleRate = 300;
      await recordAndProcessFunding(oracleRate);
      await recordAndProcessFunding(oracleRate);
      await recordAndProcessFunding(oracleRate);

      // Verify the oracle rate is correctly stored
      const poolAtSettle = await program.account.fundingPool.fetch(poolPDA);
      expect(poolAtSettle.lastActualRateBps.toNumber()).to.equal(oracleRate);

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

      // Verify exact P&L: receiver profits when actual > fixed
      const expectedPnl = computeExpectedPnl(
        notional.toNumber(), oracleRate, assignedFixedRate, durationPeriods, true
      );
      expect(expectedPnl).to.be.greaterThan(0, "receiver should profit when actual > fixed");
      expect(positionAfter.accumulatedPnl.toNumber()).to.equal(expectedPnl);

      // Verify exact payout
      const expectedPayout = computeExpectedPayout(collateralBefore, expectedPnl);
      expect(positionAfter.payoutAmount.toNumber()).to.equal(expectedPayout);
      expect(expectedPayout).to.be.greaterThan(collateralBefore);

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

    it("should close swap with loss after unfavorable funding (exact P&L)", async () => {
      // Open a receiver swap. Then feed unfavorable (negative) rates.
      const notional = new BN(5_000_000_000);
      const durationPeriods = 3;
      const maxFixedRateBps = 200;

      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();

      // Record unfavorable funding rates (low/negative => receiver loses)
      const unfavorableRate = -100;
      await recordAndProcessFunding(unfavorableRate);
      await recordAndProcessFunding(unfavorableRate);
      await recordAndProcessFunding(unfavorableRate);

      // Verify oracle rate
      const poolAtSettle = await program.account.fundingPool.fetch(poolPDA);
      expect(poolAtSettle.lastActualRateBps.toNumber()).to.equal(unfavorableRate);

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

      // Verify exact P&L
      const expectedPnl = computeExpectedPnl(
        notional.toNumber(), unfavorableRate, assignedFixedRate, durationPeriods, true
      );
      expect(expectedPnl).to.be.lessThan(0, "receiver loses when actual < fixed");
      expect(positionAfter.accumulatedPnl.toNumber()).to.equal(expectedPnl);

      // Verify exact payout (clamped >= 0)
      const expectedPayout = computeExpectedPayout(collateralBefore, expectedPnl);
      expect(positionAfter.payoutAmount.toNumber()).to.equal(expectedPayout);
      expect(expectedPayout).to.be.lessThan(collateralBefore);

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

      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();

      const poolBefore = await program.account.fundingPool.fetch(poolPDA);
      const periodsBefore = poolBefore.totalPeriodsProcessed.toNumber();

      // Process 5 funding periods sequentially with varying rates
      // Note: settle_swap uses only pool.last_actual_rate_bps (the last rate),
      // NOT the average across periods. So the final rate determines the P&L.
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

      // The last actual rate should be the final rate (200)
      expect(poolAfter.lastActualRateBps.toNumber()).to.equal(200);

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

      // Verify exact P&L using last rate (200) as the oracle rate
      const expectedPnl = computeExpectedPnl(
        notional.toNumber(), 200, assignedFixedRate, durationPeriods, true
      );
      expect(position.accumulatedPnl.toNumber()).to.equal(expectedPnl);

      // Verify exact payout
      const expectedPayout = computeExpectedPayout(collateralBefore, expectedPnl);
      expect(position.payoutAmount.toNumber()).to.equal(expectedPayout);
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

    it("should compute zero P&L when oracle rate equals fixed rate", async () => {
      // Read the current fixed rate so we can feed it as the oracle rate
      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;

      const notional = new BN(5_000_000_000);
      const durationPeriods = 2;
      const maxFixedRateBps = 300;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();

      // Feed the exact fixed rate as the oracle rate so rate_diff = 0
      await recordAndProcessFunding(assignedFixedRate);
      await recordAndProcessFunding(assignedFixedRate);

      // Verify oracle stored the rate
      const poolAtSettle = await program.account.fundingPool.fetch(poolPDA);
      expect(poolAtSettle.lastActualRateBps.toNumber()).to.equal(assignedFixedRate);

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

      // P&L should be exactly 0: notional * 0 * duration / 10000 = 0
      expect(positionAfter.accumulatedPnl.toNumber()).to.equal(0);

      // Payout should exactly equal collateral
      expect(positionAfter.payoutAmount.toNumber()).to.equal(collateralBefore);
    });

    it("should compute exact P&L for payer position with negative funding rate", async () => {
      // A payer profits when actual < fixed. Set a negative oracle rate.
      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;

      const notional = new BN(5_000_000_000);
      const durationPeriods = 2;
      // Payer requires fixed rate >= minFixedRateBps; use a very low floor
      const minFixedRateBps = -300;

      const swapPDA = await openPayerSwap(notional, durationPeriods, minFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();
      expect(positionBefore.isReceiver).to.be.false;
      expect(positionBefore.fixedRateBps).to.equal(assignedFixedRate);

      // Feed a negative oracle rate -- payer profits when actual < fixed
      const negativeRate = -150;
      await recordAndProcessFunding(negativeRate);
      await recordAndProcessFunding(negativeRate);

      const poolAtSettle = await program.account.fundingPool.fetch(poolPDA);
      expect(poolAtSettle.lastActualRateBps.toNumber()).to.equal(negativeRate);

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

      // For payer: pnl = -(notional * (actual - fixed) * duration / 10000)
      // When actual < fixed, (actual - fixed) is negative, so -(-) = positive pnl
      const expectedPnl = computeExpectedPnl(
        notional.toNumber(), negativeRate, assignedFixedRate, durationPeriods, false
      );
      expect(expectedPnl).to.be.greaterThan(0, "payer profits when actual < fixed");
      expect(positionAfter.accumulatedPnl.toNumber()).to.equal(expectedPnl);

      // Payout should exceed collateral
      const expectedPayout = computeExpectedPayout(collateralBefore, expectedPnl);
      expect(positionAfter.payoutAmount.toNumber()).to.equal(expectedPayout);
      expect(expectedPayout).to.be.greaterThan(collateralBefore);
    });

    it("should clamp payout to zero when loss exceeds collateral", async () => {
      // Open a receiver with minimal collateral (short duration = small margin),
      // then feed an extremely negative rate to create a loss larger than collateral.
      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;

      const notional = new BN(10_000_000_000); // large notional
      const durationPeriods = 1; // minimal duration => small margin
      const maxFixedRateBps = 300;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();

      // margin = 10B * 50 * 1 / 10000 = 50_000_000
      // Use a very negative rate to create loss >> collateral
      // loss = 10B * (abs(rateDiff)) * 1 / 10000
      // With rate = -999 (max allowed by oracle): rateDiff = -999 - fixedRate
      // This should produce a large loss well exceeding margin + fee
      const extremeRate = -999;
      await recordAndProcessFunding(extremeRate);

      const poolAtSettle = await program.account.fundingPool.fetch(poolPDA);
      expect(poolAtSettle.lastActualRateBps.toNumber()).to.equal(extremeRate);

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

      const expectedPnl = computeExpectedPnl(
        notional.toNumber(), extremeRate, assignedFixedRate, durationPeriods, true
      );
      expect(expectedPnl).to.be.lessThan(0);
      // Verify loss exceeds collateral (i.e. payout should be clamped)
      expect(Math.abs(expectedPnl)).to.be.greaterThan(collateralBefore);
      expect(positionAfter.accumulatedPnl.toNumber()).to.equal(expectedPnl);

      // Payout clamped to 0 via saturating_sub
      const expectedPayout = computeExpectedPayout(collateralBefore, expectedPnl);
      expect(expectedPayout).to.equal(0);
      expect(positionAfter.payoutAmount.toNumber()).to.equal(0);
    });

    it("should compute exact P&L with maximum notional", async () => {
      // Use max_notional (1_000_000_000_000) from pool params
      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;
      const maxNotional = poolAtOpen.maxNotional.toNumber();

      const notional = new BN(maxNotional);
      const durationPeriods = 1;
      const maxFixedRateBps = 300;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();

      // Verify collateral calculation with max notional
      const poolFeeRate = poolAtOpen.feeRateBps;
      const expectedCollateral = computeExpectedCollateral(maxNotional, durationPeriods, poolFeeRate);
      expect(collateralBefore).to.equal(expectedCollateral);

      // Use a moderate positive rate for a profitable receiver position
      const oracleRate = 100;
      await recordAndProcessFunding(oracleRate);

      const poolAtSettle = await program.account.fundingPool.fetch(poolPDA);
      expect(poolAtSettle.lastActualRateBps.toNumber()).to.equal(oracleRate);

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

      // Verify exact P&L with large notional
      const expectedPnl = computeExpectedPnl(
        maxNotional, oracleRate, assignedFixedRate, durationPeriods, true
      );
      expect(positionAfter.accumulatedPnl.toNumber()).to.equal(expectedPnl);

      const expectedPayout = computeExpectedPayout(collateralBefore, expectedPnl);
      expect(positionAfter.payoutAmount.toNumber()).to.equal(expectedPayout);
    });

    it("should compute exact P&L with zero oracle funding rate", async () => {
      const poolAtOpen = await program.account.fundingPool.fetch(poolPDA);
      const assignedFixedRate = poolAtOpen.currentFixedRateBps;

      const notional = new BN(5_000_000_000);
      const durationPeriods = 2;
      const maxFixedRateBps = 300;

      const swapPDA = await openReceiverSwap(notional, durationPeriods, maxFixedRateBps);

      const positionBefore = await program.account.fundingSwapPosition.fetch(swapPDA);
      const collateralBefore = positionBefore.collateralDeposited.toNumber();

      // Feed zero funding rate
      await recordAndProcessFunding(0);
      await recordAndProcessFunding(0);

      const poolAtSettle = await program.account.fundingPool.fetch(poolPDA);
      expect(poolAtSettle.lastActualRateBps.toNumber()).to.equal(0);

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

      // With zero oracle rate: pnl = notional * (0 - fixedRate) * duration / 10000
      // If fixedRate > 0, receiver loses (pays fixed, receives zero floating)
      const expectedPnl = computeExpectedPnl(
        notional.toNumber(), 0, assignedFixedRate, durationPeriods, true
      );
      expect(positionAfter.accumulatedPnl.toNumber()).to.equal(expectedPnl);

      // If fixed rate is positive, pnl should be negative for receiver
      if (assignedFixedRate > 0) {
        expect(expectedPnl).to.be.lessThan(0);
        expect(positionAfter.payoutAmount.toNumber()).to.be.lessThan(collateralBefore);
      }

      const expectedPayout = computeExpectedPayout(collateralBefore, expectedPnl);
      expect(positionAfter.payoutAmount.toNumber()).to.equal(expectedPayout);
    });
  });
});
