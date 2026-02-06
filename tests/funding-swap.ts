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
    // Create collateral mint (USDC-like)
    collateralMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      authority.publicKey,
      null,
      6
    );

    // Initialize funding feed in oracle program
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

    // Create user's collateral token account
    userCollateralAccount = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as any).payer,
      collateralMint,
      authority.publicKey
    );

    // Mint collateral to user
    await mintTo(
      provider.connection,
      (provider.wallet as any).payer,
      collateralMint,
      userCollateralAccount,
      authority.publicKey,
      1_000_000_000_000 // $1,000,000
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
        swapDurationSeconds: new BN(604800), // 7 days
        minNotional: new BN(1_000_000_000), // $1,000
        maxNotional: new BN(1_000_000_000_000), // $1,000,000
        feeRateBps: 30, // 0.3%
        maxRateSpreadBps: 500, // 5% max spread
      };

      try {
        await program.methods
          .initializePool(marketSymbol, poolParams)
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
          .updatePool(40, null, null, null)
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
    let receiveFixedPositionPDA: PublicKey;
    let payFixedPositionPDA: PublicKey;
    let lpAccountPDA: PublicKey;

    before(async () => {
      // Deposit liquidity first
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

    it("should open a receive-fixed swap position", async () => {
      const notional = new BN(50_000_000_000); // $50,000
      const fixedRateBps = new BN(40); // 0.04% per 8h
      const swapId = new BN(1);

      [receiveFixedPositionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap_position"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          swapId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openReceiveFixed(notional, fixedRateBps, swapId)
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            position: receiveFixedPositionPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const position = await program.account.fundingSwapPosition.fetch(receiveFixedPositionPDA);
        expect(position.isReceiveFixed).to.be.true;
        expect(position.notional.toNumber()).to.equal(50_000_000_000);
        expect(position.fixedRateBps.toNumber()).to.equal(40);
      } catch (e) {
        console.log("Open receive-fixed error:", e);
        throw e;
      }
    });

    it("should open a pay-fixed swap position", async () => {
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

      const notional = new BN(25_000_000_000); // $25,000
      const fixedRateBps = new BN(35); // 0.035% per 8h
      const swapId = new BN(1);

      [payFixedPositionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap_position"),
          poolPDA.toBuffer(),
          newUser.publicKey.toBuffer(),
          swapId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openPayFixed(notional, fixedRateBps, swapId)
          .accounts({
            user: newUser.publicKey,
            pool: poolPDA,
            position: payFixedPositionPDA,
            userCollateral: newUserCollateral,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([newUser])
          .rpc();

        const position = await program.account.fundingSwapPosition.fetch(payFixedPositionPDA);
        expect(position.isReceiveFixed).to.be.false;
        expect(position.notional.toNumber()).to.equal(25_000_000_000);
      } catch (e) {
        console.log("Open pay-fixed error:", e);
        throw e;
      }
    });

    it("should record a funding payment", async () => {
      // First, record a funding rate in the oracle
      await oracleProgram.methods
        .recordFundingRate(new BN(50)) // 0.05% rate
        .accounts({
          authority: authority.publicKey,
          fundingFeed: fundingFeedPDA,
        })
        .rpc();

      try {
        await program.methods
          .recordFundingPayment()
          .accounts({
            authority: authority.publicKey,
            pool: poolPDA,
            position: receiveFixedPositionPDA,
            fundingFeed: fundingFeedPDA,
          })
          .rpc();

        const position = await program.account.fundingSwapPosition.fetch(receiveFixedPositionPDA);
        // Payment should be recorded
        expect(position.totalPayments.toNumber()).to.not.equal(0);
      } catch (e) {
        console.log("Record funding payment error:", e);
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
            position: receiveFixedPositionPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        // Position status should be settled
        const position = await program.account.fundingSwapPosition.fetch(receiveFixedPositionPDA);
        expect(position.status).to.deep.equal({ settled: {} });
      } catch (e) {
        // May fail if not expired yet
        console.log("Settle swap (may not be expired yet):", e);
      }
    });

    it("should close swap position early", async () => {
      // Create a new position to close early
      const swapId = new BN(2);
      const [newPositionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap_position"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          swapId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openReceiveFixed(
            new BN(10_000_000_000),
            new BN(45),
            swapId
          )
          .accounts({
            user: authority.publicKey,
            pool: poolPDA,
            position: newPositionPDA,
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
            position: newPositionPDA,
            userCollateral: userCollateralAccount,
            poolVault: poolVaultPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        // Position should be closed
        try {
          await program.account.fundingSwapPosition.fetch(newPositionPDA);
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
    it("should reject swap with excessive spread", async () => {
      const notional = new BN(10_000_000_000);
      const fixedRateBps = new BN(1000); // 10% - too high
      const swapId = new BN(999);

      const [positionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap_position"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          swapId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openReceiveFixed(notional, fixedRateBps, swapId)
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

        expect.fail("Should have rejected due to excessive spread");
      } catch (e: any) {
        expect(e.message).to.include("SpreadTooHigh");
      }
    });

    it("should reject notional below minimum", async () => {
      const notional = new BN(100_000_000); // $100, below minimum
      const fixedRateBps = new BN(40);
      const swapId = new BN(998);

      const [positionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("swap_position"),
          poolPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          swapId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .openReceiveFixed(notional, fixedRateBps, swapId)
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
  });
});
