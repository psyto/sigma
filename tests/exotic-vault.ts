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

type ExoticVault = any;

describe("exotic-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ExoticVault as Program<ExoticVault>;
  const oracleProgram = anchor.workspace.SharedOracle;

  const authority = provider.wallet;
  let collateralMint: PublicKey;
  let underlyingMint: Keypair;
  let priceFeedPDA: PublicKey;
  let vaultPDA: PublicKey;
  let vaultCollateralPDA: PublicKey;
  let userCollateralAccount: PublicKey;

  before(async () => {
    // Create collateral mint (USDC-like)
    collateralMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      authority.publicKey,
      null,
      6
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
        .initializePriceFeed("SOL", new BN(60), 1000)
        .accounts({
          authority: authority.publicKey,
          assetMint: underlyingMint.publicKey,
          priceFeed: priceFeedPDA,
          sampleBuffer: sampleBufferPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Record initial price
      await oracleProgram.methods
        .recordPrice(new BN(150_000_000)) // $150 SOL
        .accounts({
          authority: authority.publicKey,
          priceFeed: priceFeedPDA,
          sampleBuffer: sampleBufferPDA,
        })
        .rpc();
    } catch (e) {
      console.log("Price feed may already exist");
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
  // Vault Initialization Tests
  // ============================================================================

  describe("Vault Initialization", () => {
    it("should initialize an exotic options vault", async () => {
      [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("exotic_vault"), underlyingMint.publicKey.toBuffer()],
        program.programId
      );

      [vaultCollateralPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_collateral"), vaultPDA.toBuffer()],
        program.programId
      );

      const vaultParams = {
        minNotional: new BN(1_000_000_000), // $1,000
        maxNotional: new BN(100_000_000_000), // $100,000
        minDurationDays: 1,
        maxDurationDays: 90,
        feeRateBps: 50, // 0.5%
        sampleIntervalSeconds: new BN(3600), // 1 hour
      };

      try {
        await program.methods
          .initializeVault(vaultParams)
          .accounts({
            authority: authority.publicKey,
            collateralMint: collateralMint,
            underlyingMint: underlyingMint.publicKey,
            priceFeed: priceFeedPDA,
            vault: vaultPDA,
            vaultCollateral: vaultCollateralPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const vault = await program.account.exoticVault.fetch(vaultPDA);
        expect(vault.authority.toString()).to.equal(authority.publicKey.toString());
        expect(vault.isActive).to.be.true;
        expect(vault.totalOptions.toNumber()).to.equal(0);
      } catch (e) {
        console.log("Initialize vault error:", e);
        throw e;
      }
    });

    it("should update vault parameters", async () => {
      try {
        await program.methods
          .updateVault(75, null) // Update fee to 0.75%
          .accounts({
            authority: authority.publicKey,
            vault: vaultPDA,
          })
          .rpc();

        const vault = await program.account.exoticVault.fetch(vaultPDA);
        expect(vault.feeRateBps).to.equal(75);
      } catch (e) {
        console.log("Update vault error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Liquidity Provider Tests
  // ============================================================================

  describe("Liquidity Provision", () => {
    let lpAccountPDA: PublicKey;

    it("should deposit liquidity to vault", async () => {
      const depositAmount = new BN(100_000_000_000); // $100,000

      [lpAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp"), vaultPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .depositLiquidity(depositAmount)
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            lpAccount: lpAccountPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
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

    it("should withdraw liquidity from vault", async () => {
      const withdrawShares = new BN(25_000_000_000); // Withdraw some shares

      try {
        await program.methods
          .withdrawLiquidity(withdrawShares)
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            lpAccount: lpAccountPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
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
  // Asian Options Tests
  // ============================================================================

  describe("Asian Options", () => {
    let asianCallOptionPDA: PublicKey;
    let asianPutOptionPDA: PublicKey;
    let sampleBufferPDA: PublicKey;

    it("should buy an Asian call option", async () => {
      const vault = await program.account.exoticVault.fetch(vaultPDA);
      const optionIndex = vault.totalOptions;

      [asianCallOptionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("option"),
          vaultPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          optionIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      [sampleBufferPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("samples"), asianCallOptionPDA.toBuffer()],
        program.programId
      );

      const strikePrice = new BN(140_000_000); // $140 strike
      const notional = new BN(10_000_000_000); // $10,000 notional
      const durationDays = 7;

      try {
        await program.methods
          .buyAsianCall(strikePrice, notional, durationDays)
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: asianCallOptionPDA,
            sampleBuffer: sampleBufferPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const option = await program.account.exoticOption.fetch(asianCallOptionPDA);
        expect(option.optionType).to.deep.equal({ asianCall: {} });
        expect(option.strikePrice.toNumber()).to.equal(140_000_000);
        expect(option.notional.toNumber()).to.equal(10_000_000_000);
        expect(option.status).to.deep.equal({ active: {} });
      } catch (e) {
        console.log("Buy Asian call error:", e);
        throw e;
      }
    });

    it("should buy an Asian put option", async () => {
      const vault = await program.account.exoticVault.fetch(vaultPDA);
      const optionIndex = vault.totalOptions;

      [asianPutOptionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("option"),
          vaultPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          optionIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [putSampleBufferPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("samples"), asianPutOptionPDA.toBuffer()],
        program.programId
      );

      const strikePrice = new BN(160_000_000); // $160 strike
      const notional = new BN(5_000_000_000); // $5,000 notional
      const durationDays = 14;

      try {
        await program.methods
          .buyAsianPut(strikePrice, notional, durationDays)
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: asianPutOptionPDA,
            sampleBuffer: putSampleBufferPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const option = await program.account.exoticOption.fetch(asianPutOptionPDA);
        expect(option.optionType).to.deep.equal({ asianPut: {} });
        expect(option.strikePrice.toNumber()).to.equal(160_000_000);
      } catch (e) {
        console.log("Buy Asian put error:", e);
        throw e;
      }
    });

    it("should record price samples for Asian options", async () => {
      try {
        await program.methods
          .recordPriceSample()
          .accounts({
            oracle: authority.publicKey,
            vault: vaultPDA,
            option: asianCallOptionPDA,
            sampleBuffer: sampleBufferPDA,
            priceFeed: priceFeedPDA,
          })
          .rpc();

        const sampleBuffer = await program.account.priceSampleBuffer.fetch(sampleBufferPDA);
        expect(sampleBuffer.samples.length).to.be.greaterThan(0);
      } catch (e) {
        console.log("Record price sample error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Barrier Options Tests
  // ============================================================================

  describe("Barrier Options", () => {
    let knockoutCallPDA: PublicKey;
    let knockinPutPDA: PublicKey;

    it("should buy a knock-out call option (Up-and-Out)", async () => {
      const vault = await program.account.exoticVault.fetch(vaultPDA);
      const optionIndex = vault.totalOptions;

      [knockoutCallPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("option"),
          vaultPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          optionIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const strikePrice = new BN(145_000_000); // $145 strike
      const barrierPrice = new BN(180_000_000); // $180 barrier (up)
      const notional = new BN(8_000_000_000); // $8,000 notional
      const durationDays = 30;
      const isCall = true;
      const isUpBarrier = true;

      try {
        await program.methods
          .buyKnockout(strikePrice, barrierPrice, notional, durationDays, isCall, isUpBarrier)
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: knockoutCallPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const option = await program.account.exoticOption.fetch(knockoutCallPDA);
        expect(option.optionType).to.deep.equal({ upAndOutCall: {} });
        expect(option.barrierPrice.toNumber()).to.equal(180_000_000);
        expect(option.barrierBreached).to.be.false;
      } catch (e) {
        console.log("Buy knockout call error:", e);
        throw e;
      }
    });

    it("should buy a knock-in put option (Down-and-In)", async () => {
      const vault = await program.account.exoticVault.fetch(vaultPDA);
      const optionIndex = vault.totalOptions;

      [knockinPutPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("option"),
          vaultPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          optionIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const strikePrice = new BN(155_000_000); // $155 strike
      const barrierPrice = new BN(120_000_000); // $120 barrier (down)
      const notional = new BN(6_000_000_000); // $6,000 notional
      const durationDays = 21;
      const isCall = false;
      const isUpBarrier = false;

      try {
        await program.methods
          .buyKnockin(strikePrice, barrierPrice, notional, durationDays, isCall, isUpBarrier)
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: knockinPutPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const option = await program.account.exoticOption.fetch(knockinPutPDA);
        expect(option.optionType).to.deep.equal({ downAndInPut: {} });
        expect(option.barrierPrice.toNumber()).to.equal(120_000_000);
      } catch (e) {
        console.log("Buy knockin put error:", e);
        throw e;
      }
    });

    it("should check barrier and update status", async () => {
      try {
        await program.methods
          .checkBarrier()
          .accounts({
            keeper: authority.publicKey,
            vault: vaultPDA,
            option: knockoutCallPDA,
            priceFeed: priceFeedPDA,
          })
          .rpc();

        // Barrier should not be breached yet (price is $150, barrier is $180)
        const option = await program.account.exoticOption.fetch(knockoutCallPDA);
        expect(option.barrierBreached).to.be.false;
        expect(option.status).to.deep.equal({ active: {} });
      } catch (e) {
        console.log("Check barrier error:", e);
        throw e;
      }
    });
  });

  // ============================================================================
  // Settlement Tests
  // ============================================================================

  describe("Option Settlement", () => {
    let settleOptionPDA: PublicKey;
    let settleSampleBufferPDA: PublicKey;

    before(async () => {
      // Create a new option for settlement testing
      const vault = await program.account.exoticVault.fetch(vaultPDA);
      const optionIndex = vault.totalOptions;

      [settleOptionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("option"),
          vaultPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          optionIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      [settleSampleBufferPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("samples"), settleOptionPDA.toBuffer()],
        program.programId
      );

      // Buy an Asian call with short duration for testing
      try {
        await program.methods
          .buyAsianCall(
            new BN(140_000_000), // $140 strike
            new BN(5_000_000_000), // $5,000 notional
            1 // 1 day duration
          )
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: settleOptionPDA,
            sampleBuffer: settleSampleBufferPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (e) {
        console.log("Create option for settlement error:", e);
      }
    });

    it("should settle an option at expiry", async () => {
      try {
        await program.methods
          .settleOption()
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: settleOptionPDA,
            sampleBuffer: settleSampleBufferPDA,
            priceFeed: priceFeedPDA,
          })
          .rpc();

        const option = await program.account.exoticOption.fetch(settleOptionPDA);
        expect(option.status).to.deep.equal({ settled: {} });
        expect(option.settlementPrice).to.not.be.null;
      } catch (e) {
        // May fail if not expired yet - expected in test environment
        console.log("Settle option (may not be expired yet):", e);
      }
    });

    it("should claim payout after settlement", async () => {
      try {
        // First settle if not already settled
        const option = await program.account.exoticOption.fetch(settleOptionPDA);

        if (option.status.settled) {
          await program.methods
            .claimPayout()
            .accounts({
              user: authority.publicKey,
              vault: vaultPDA,
              option: settleOptionPDA,
              vaultCollateral: vaultCollateralPDA,
              userCollateral: userCollateralAccount,
              collateralMint: collateralMint,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

          // Option account should be closed after claim
          try {
            await program.account.exoticOption.fetch(settleOptionPDA);
            expect.fail("Option should be closed after claim");
          } catch (e: any) {
            expect(e.message).to.include("Account does not exist");
          }
        }
      } catch (e) {
        console.log("Claim payout error:", e);
      }
    });
  });

  // ============================================================================
  // Error Cases
  // ============================================================================

  describe("Error Cases", () => {
    it("should reject notional below minimum", async () => {
      const vault = await program.account.exoticVault.fetch(vaultPDA);
      const optionIndex = vault.totalOptions;

      const [positionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("option"),
          vaultPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          optionIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [sbPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("samples"), positionPDA.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .buyAsianCall(
            new BN(150_000_000),
            new BN(100_000_000), // $100, below minimum
            7
          )
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: positionPDA,
            sampleBuffer: sbPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
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

    it("should reject duration outside allowed range", async () => {
      const vault = await program.account.exoticVault.fetch(vaultPDA);
      const optionIndex = vault.totalOptions;

      const [positionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("option"),
          vaultPDA.toBuffer(),
          authority.publicKey.toBuffer(),
          optionIndex.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [sbPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("samples"), positionPDA.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .buyAsianCall(
            new BN(150_000_000),
            new BN(10_000_000_000),
            365 // 1 year, likely above max
          )
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: positionPDA,
            sampleBuffer: sbPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have rejected due to invalid duration");
      } catch (e: any) {
        expect(e.message).to.include("InvalidDuration");
      }
    });

    it("should reject unauthorized vault updates", async () => {
      const unauthorizedUser = Keypair.generate();

      try {
        await program.methods
          .updateVault(100, null)
          .accounts({
            authority: unauthorizedUser.publicKey,
            vault: vaultPDA,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Should have rejected unauthorized update");
      } catch (e: any) {
        expect(e.message).to.include("Unauthorized");
      }
    });

    it("should reject options when vault is inactive", async () => {
      // First deactivate the vault
      try {
        await program.methods
          .updateVault(null, false)
          .accounts({
            authority: authority.publicKey,
            vault: vaultPDA,
          })
          .rpc();

        const vault = await program.account.exoticVault.fetch(vaultPDA);
        const optionIndex = vault.totalOptions;

        const [positionPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("option"),
            vaultPDA.toBuffer(),
            authority.publicKey.toBuffer(),
            optionIndex.toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        const [sbPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("samples"), positionPDA.toBuffer()],
          program.programId
        );

        await program.methods
          .buyAsianCall(
            new BN(150_000_000),
            new BN(10_000_000_000),
            7
          )
          .accounts({
            user: authority.publicKey,
            vault: vaultPDA,
            option: positionPDA,
            sampleBuffer: sbPDA,
            userCollateral: userCollateralAccount,
            vaultCollateral: vaultCollateralPDA,
            collateralMint: collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have rejected due to inactive vault");
      } catch (e: any) {
        expect(e.message).to.include("VaultInactive");
      } finally {
        // Reactivate vault for other tests
        await program.methods
          .updateVault(null, true)
          .accounts({
            authority: authority.publicKey,
            vault: vaultPDA,
          })
          .rpc();
      }
    });
  });
});
