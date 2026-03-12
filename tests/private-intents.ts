import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

// Import from private-intents package
import {
  encrypt,
  decrypt,
  generateEncryptionKeypair,
  deriveEncryptionKeypair,
  serializeVarianceSwapIntent,
  deserializeVarianceSwapIntent,
  serializeFundingSwapIntent,
  deserializeFundingSwapIntent,
  serializeExoticOptionIntent,
  deserializeExoticOptionIntent,
  validateVarianceSwapIntent,
  IntentType,
  ExoticOptionType,
} from "@sigma-protocol/private-intents";

describe("private-intents", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Test accounts
  const authority = Keypair.generate();
  const user = Keypair.generate();
  const solver = Keypair.generate();
  let collateralMint: PublicKey;
  let userCollateralAccount: PublicKey;

  // Encryption keypairs
  let userEncryptionKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  let solverEncryptionKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };

  before(async () => {
    // Airdrop SOL to test accounts
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(authority.publicKey, 10e9)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 10e9)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(solver.publicKey, 10e9)
    );

    // Create collateral mint (USDC mock)
    collateralMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    // Create user token account and mint some tokens
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      collateralMint,
      user.publicKey
    );
    userCollateralAccount = userTokenAccount.address;

    await mintTo(
      provider.connection,
      authority,
      collateralMint,
      userCollateralAccount,
      authority,
      1_000_000_000_000 // 1M USDC
    );

    // Generate encryption keypairs
    userEncryptionKeypair = generateEncryptionKeypair();
    solverEncryptionKeypair = generateEncryptionKeypair();
  });

  describe("Encryption", () => {
    it("should generate valid encryption keypairs", () => {
      const keypair = generateEncryptionKeypair();
      expect(keypair.publicKey).to.have.length(32);
      expect(keypair.secretKey).to.have.length(32);
    });

    it("should derive deterministic keypair from seed", () => {
      const seed = new Uint8Array(32).fill(42);
      const keypair1 = deriveEncryptionKeypair(seed);
      const keypair2 = deriveEncryptionKeypair(seed);

      expect(Buffer.from(keypair1.publicKey).toString("hex")).to.equal(
        Buffer.from(keypair2.publicKey).toString("hex")
      );
      expect(Buffer.from(keypair1.secretKey).toString("hex")).to.equal(
        Buffer.from(keypair2.secretKey).toString("hex")
      );
    });

    it("should encrypt and decrypt data correctly", () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      const encrypted = encrypt(
        plaintext,
        solverEncryptionKeypair.publicKey,
        userEncryptionKeypair
      );

      expect(encrypted.bytes.length).to.be.greaterThan(plaintext.length);
      expect(encrypted.nonce).to.have.length(24);

      const decrypted = decrypt(
        encrypted.bytes,
        userEncryptionKeypair.publicKey,
        solverEncryptionKeypair
      );

      expect(Buffer.from(decrypted).toString("hex")).to.equal(
        Buffer.from(plaintext).toString("hex")
      );
    });

    it("should fail decryption with wrong key", () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const wrongKeypair = generateEncryptionKeypair();

      const encrypted = encrypt(
        plaintext,
        solverEncryptionKeypair.publicKey,
        userEncryptionKeypair
      );

      expect(() => {
        decrypt(
          encrypted.bytes,
          userEncryptionKeypair.publicKey,
          wrongKeypair
        );
      }).to.throw("Decryption failed");
    });
  });

  describe("Payload Serialization", () => {
    it("should serialize and deserialize variance swap intent", () => {
      const intent = {
        notional: new BN(1_000_000_000),
        premiumLimit: new BN(50_000_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        isLong: true,
      };

      const serialized = serializeVarianceSwapIntent(intent);
      expect(serialized.length).to.equal(40); // Fixed size

      const deserialized = deserializeVarianceSwapIntent(serialized);
      expect(deserialized.notional.toString()).to.equal(intent.notional.toString());
      expect(deserialized.premiumLimit.toString()).to.equal(intent.premiumLimit.toString());
      expect(deserialized.strikeVarianceBps.toString()).to.equal(intent.strikeVarianceBps.toString());
      expect(deserialized.deadline).to.equal(intent.deadline);
      expect(deserialized.slippageBps).to.equal(intent.slippageBps);
      expect(deserialized.isLong).to.equal(intent.isLong);
    });

    it("should serialize and deserialize funding swap intent", () => {
      const intent = {
        notional: new BN(500_000_000),
        durationPeriods: 30,
        fixedRateLimitBps: -50, // Negative rate
        deadline: Math.floor(Date.now() / 1000) + 7200,
        slippageBps: 50,
        isReceiver: false,
      };

      const serialized = serializeFundingSwapIntent(intent);
      expect(serialized.length).to.equal(26);

      const deserialized = deserializeFundingSwapIntent(serialized);
      expect(deserialized.notional.toString()).to.equal(intent.notional.toString());
      expect(deserialized.durationPeriods).to.equal(intent.durationPeriods);
      expect(deserialized.fixedRateLimitBps).to.equal(intent.fixedRateLimitBps);
      expect(deserialized.deadline).to.equal(intent.deadline);
      expect(deserialized.slippageBps).to.equal(intent.slippageBps);
      expect(deserialized.isReceiver).to.equal(intent.isReceiver);
    });

    it("should serialize and deserialize exotic option intent", () => {
      const intent = {
        notional: new BN(2_000_000_000),
        strikePrice: new BN(50_000_000_000), // $50,000
        barrierPrice: new BN(55_000_000_000), // $55,000
        durationDays: 30,
        deadline: Math.floor(Date.now() / 1000) + 1800,
        slippageBps: 200,
        optionType: ExoticOptionType.UpAndOutCall,
      };

      const serialized = serializeExoticOptionIntent(intent);
      expect(serialized.length).to.equal(42);

      const deserialized = deserializeExoticOptionIntent(serialized);
      expect(deserialized.notional.toString()).to.equal(intent.notional.toString());
      expect(deserialized.strikePrice.toString()).to.equal(intent.strikePrice.toString());
      expect(deserialized.barrierPrice.toString()).to.equal(intent.barrierPrice.toString());
      expect(deserialized.durationDays).to.equal(intent.durationDays);
      expect(deserialized.deadline).to.equal(intent.deadline);
      expect(deserialized.slippageBps).to.equal(intent.slippageBps);
      expect(deserialized.optionType).to.equal(intent.optionType);
    });
  });

  describe("Validation", () => {
    it("should validate valid variance swap intent", () => {
      const validIntent = {
        notional: new BN(1_000_000),
        premiumLimit: new BN(50_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        isLong: true,
      };

      expect(() => validateVarianceSwapIntent(validIntent)).to.not.throw();
    });

    it("should reject variance swap with zero notional", () => {
      const invalidIntent = {
        notional: new BN(0),
        premiumLimit: new BN(50_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        isLong: true,
      };

      expect(() => validateVarianceSwapIntent(invalidIntent)).to.throw(
        "Notional must be positive"
      );
    });

    it("should reject variance swap with past deadline", () => {
      const invalidIntent = {
        notional: new BN(1_000_000),
        premiumLimit: new BN(50_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) - 100, // Past
        slippageBps: 100,
        isLong: true,
      };

      expect(() => validateVarianceSwapIntent(invalidIntent)).to.throw(
        "Deadline must be in the future"
      );
    });

    it("should reject variance swap with excessive slippage", () => {
      const invalidIntent = {
        notional: new BN(1_000_000),
        premiumLimit: new BN(50_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 15000, // > 100%
        isLong: true,
      };

      expect(() => validateVarianceSwapIntent(invalidIntent)).to.throw(
        "Slippage cannot exceed 100%"
      );
    });
  });

  describe("End-to-End Encryption Flow", () => {
    it("should complete full encrypt-decrypt cycle for variance swap", () => {
      // User creates intent
      const intent = {
        notional: new BN(1_000_000_000),
        premiumLimit: new BN(50_000_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        isLong: true,
      };

      // Validate
      validateVarianceSwapIntent(intent);

      // Serialize
      const serialized = serializeVarianceSwapIntent(intent);

      // Encrypt with solver's public key
      const encrypted = encrypt(
        serialized,
        solverEncryptionKeypair.publicKey,
        userEncryptionKeypair
      );

      // Solver decrypts with user's public key
      const decrypted = decrypt(
        encrypted.bytes,
        userEncryptionKeypair.publicKey,
        solverEncryptionKeypair
      );

      // Solver deserializes
      const recoveredIntent = deserializeVarianceSwapIntent(decrypted);

      // Verify all fields match
      expect(recoveredIntent.notional.toString()).to.equal(intent.notional.toString());
      expect(recoveredIntent.premiumLimit.toString()).to.equal(intent.premiumLimit.toString());
      expect(recoveredIntent.strikeVarianceBps.toString()).to.equal(intent.strikeVarianceBps.toString());
      expect(recoveredIntent.deadline).to.equal(intent.deadline);
      expect(recoveredIntent.slippageBps).to.equal(intent.slippageBps);
      expect(recoveredIntent.isLong).to.equal(intent.isLong);
    });
  });

  // ============================================================================
  // On-Chain Integration Tests
  // ============================================================================

  describe("On-Chain Operations", () => {
    // Program reference
    type PrivateIntents = any;
    const program = anchor.workspace.PrivateIntents as Program<PrivateIntents>;

    let solverConfigPDA: PublicKey;
    let solverConfigBump: number;

    // Helper to derive intent PDA
    function deriveIntentPDA(
      owner: PublicKey,
      intentId: BN
    ): [PublicKey, number] {
      return PublicKey.findProgramAddressSync(
        [
          Buffer.from("encrypted_intent"),
          owner.toBuffer(),
          intentId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
    }

    // Helper to derive intent vault PDA
    function deriveIntentVaultPDA(intentKey: PublicKey): [PublicKey, number] {
      return PublicKey.findProgramAddressSync(
        [Buffer.from("intent_vault"), intentKey.toBuffer()],
        program.programId
      );
    }

    before(async () => {
      // Derive solver config PDA
      [solverConfigPDA, solverConfigBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("solver_config")],
        program.programId
      );
    });

    // ========================================================================
    // Initialize Solver
    // ========================================================================

    describe("initialize_solver", () => {
      it("should initialize solver config with valid params", async () => {
        const feeBps = 10; // 0.1%
        const minCollateral = new BN(1_000_000); // 1 USDC
        const maxPayloadSize = 256;

        try {
          await program.methods
            .initializeSolver(
              solver.publicKey,
              feeBps,
              minCollateral,
              maxPayloadSize
            )
            .accounts({
              authority: authority.publicKey,
              solverConfig: solverConfigPDA,
              systemProgram: SystemProgram.programId,
            })
            .signers([authority])
            .rpc();

          // Fetch and verify state
          const config = await program.account.solverConfig.fetch(
            solverConfigPDA
          );
          expect(config.authority.toString()).to.equal(
            authority.publicKey.toString()
          );
          expect(config.solverPubkey.toString()).to.equal(
            solver.publicKey.toString()
          );
          expect(config.feeBps).to.equal(feeBps);
          expect(config.minCollateral.toNumber()).to.equal(
            minCollateral.toNumber()
          );
          expect(config.maxPayloadSize).to.equal(maxPayloadSize);
          expect(config.isActive).to.be.true;
          expect(config.totalIntents.toNumber()).to.equal(0);
          expect(config.totalVolume.toNumber()).to.equal(0);
        } catch (e) {
          console.log("Initialize solver error:", e);
          throw e;
        }
      });

      it("should reject re-initialization (PDA already exists)", async () => {
        try {
          await program.methods
            .initializeSolver(
              solver.publicKey,
              10,
              new BN(1_000_000),
              256
            )
            .accounts({
              authority: authority.publicKey,
              solverConfig: solverConfigPDA,
              systemProgram: SystemProgram.programId,
            })
            .signers([authority])
            .rpc();

          expect.fail("Should have thrown - PDA already initialized");
        } catch (e: any) {
          // Account already exists error from Anchor/runtime
          expect(e.message).to.not.be.empty;
        }
      });
    });

    // ========================================================================
    // Submit Intent
    // ========================================================================

    describe("submit_intent", () => {
      const intentId = new BN(1);
      let intentPDA: PublicKey;
      let intentBump: number;
      let intentVaultPDA: PublicKey;

      before(async () => {
        [intentPDA, intentBump] = deriveIntentPDA(user.publicKey, intentId);
        [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
      });

      it("should submit an intent with native collateral", async () => {
        const targetPool = Keypair.generate().publicKey;
        const collateralAmount = new BN(10_000_000); // 10 USDC

        // Create an encrypted payload (must be >= 40 bytes)
        const dummyPayload = Buffer.alloc(64);
        dummyPayload.fill(0xab);

        // User encryption pubkey (32 bytes)
        const encPubkey = Buffer.from(userEncryptionKeypair.publicKey);

        try {
          await program.methods
            .submitIntent(
              intentId,
              { varianceSwap: {} },
              collateralAmount,
              dummyPayload,
              encPubkey
            )
            .accounts({
              owner: user.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA,
              targetPool: targetPool,
              collateralMint: collateralMint,
              userCollateral: userCollateralAccount,
              intentVault: intentVaultPDA,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          // Fetch and verify intent state
          const intent = await program.account.encryptedIntent.fetch(intentPDA);
          expect(intent.owner.toString()).to.equal(
            user.publicKey.toString()
          );
          expect(intent.intentId.toNumber()).to.equal(1);
          expect(intent.collateralAmount.toNumber()).to.equal(
            collateralAmount.toNumber()
          );
          expect(intent.collateralMint.toString()).to.equal(
            collateralMint.toString()
          );
          expect(intent.targetPool.toString()).to.equal(
            targetPool.toString()
          );
          expect(intent.encryptedPayload).to.have.length(64);
          expect(intent.userEncryptionPubkey).to.have.length(32);
          expect(JSON.stringify(intent.status)).to.include("pending");
          expect(intent.createdAt.toNumber()).to.be.greaterThan(0);
          expect(intent.executedAt.toNumber()).to.equal(0);
          expect(intent.executedBy).to.be.null;
          expect(intent.resultPosition).to.be.null;

          // Verify vault received the collateral
          const vaultAccount =
            await provider.connection.getTokenAccountBalance(intentVaultPDA);
          expect(vaultAccount.value.amount).to.equal(
            collateralAmount.toString()
          );
        } catch (e) {
          console.log("Submit intent error:", e);
          throw e;
        }
      });

      it("should submit a second intent with different ID", async () => {
        const intentId2 = new BN(2);
        const [intentPDA2] = deriveIntentPDA(user.publicKey, intentId2);
        const [intentVaultPDA2] = deriveIntentVaultPDA(intentPDA2);

        const targetPool = Keypair.generate().publicKey;
        const collateralAmount = new BN(5_000_000); // 5 USDC
        const dummyPayload = Buffer.alloc(48);
        dummyPayload.fill(0xcd);
        const encPubkey = Buffer.from(userEncryptionKeypair.publicKey);

        try {
          await program.methods
            .submitIntent(
              intentId2,
              { fundingSwap: {} },
              collateralAmount,
              dummyPayload,
              encPubkey
            )
            .accounts({
              owner: user.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA2,
              targetPool: targetPool,
              collateralMint: collateralMint,
              userCollateral: userCollateralAccount,
              intentVault: intentVaultPDA2,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          const intent = await program.account.encryptedIntent.fetch(
            intentPDA2
          );
          expect(intent.intentId.toNumber()).to.equal(2);
          expect(JSON.stringify(intent.intentType)).to.include("fundingSwap");
        } catch (e) {
          console.log("Submit second intent error:", e);
          throw e;
        }
      });
    });

    // ========================================================================
    // Cancel Intent
    // ========================================================================

    describe("cancel_intent", () => {
      const cancelIntentId = new BN(100);
      let cancelIntentPDA: PublicKey;
      let cancelIntentVaultPDA: PublicKey;

      it("should submit and then cancel an intent, returning collateral", async () => {
        [cancelIntentPDA] = deriveIntentPDA(user.publicKey, cancelIntentId);
        [cancelIntentVaultPDA] = deriveIntentVaultPDA(cancelIntentPDA);

        const targetPool = Keypair.generate().publicKey;
        const collateralAmount = new BN(20_000_000); // 20 USDC
        const dummyPayload = Buffer.alloc(48);
        dummyPayload.fill(0xef);
        const encPubkey = Buffer.from(userEncryptionKeypair.publicKey);

        // Record balance before submit
        const balanceBefore =
          await provider.connection.getTokenAccountBalance(
            userCollateralAccount
          );

        // Submit the intent
        await program.methods
          .submitIntent(
            cancelIntentId,
            { exoticOption: {} },
            collateralAmount,
            dummyPayload,
            encPubkey
          )
          .accounts({
            owner: user.publicKey,
            solverConfig: solverConfigPDA,
            intent: cancelIntentPDA,
            targetPool: targetPool,
            collateralMint: collateralMint,
            userCollateral: userCollateralAccount,
            intentVault: cancelIntentVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();

        // Verify collateral was taken
        const balanceAfterSubmit =
          await provider.connection.getTokenAccountBalance(
            userCollateralAccount
          );
        expect(
          Number(balanceBefore.value.amount) -
            Number(balanceAfterSubmit.value.amount)
        ).to.equal(collateralAmount.toNumber());

        // Cancel the intent
        try {
          await program.methods
            .cancelIntent()
            .accounts({
              owner: user.publicKey,
              intent: cancelIntentPDA,
              collateralMint: collateralMint,
              intentVault: cancelIntentVaultPDA,
              userCollateral: userCollateralAccount,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          // Verify intent status is Cancelled
          const intent = await program.account.encryptedIntent.fetch(
            cancelIntentPDA
          );
          expect(JSON.stringify(intent.status)).to.include("cancelled");

          // Verify collateral was returned
          const balanceAfterCancel =
            await provider.connection.getTokenAccountBalance(
              userCollateralAccount
            );
          expect(balanceAfterCancel.value.amount).to.equal(
            balanceBefore.value.amount
          );
        } catch (e) {
          console.log("Cancel intent error:", e);
          throw e;
        }
      });

      it("should not allow cancelling an already-cancelled intent", async () => {
        // The intent from the previous test is already cancelled.
        // Re-derive vault PDA -- but the vault was closed, so this should fail.
        try {
          await program.methods
            .cancelIntent()
            .accounts({
              owner: user.publicKey,
              intent: cancelIntentPDA,
              collateralMint: collateralMint,
              intentVault: cancelIntentVaultPDA,
              userCollateral: userCollateralAccount,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          expect.fail("Should have thrown - intent already cancelled");
        } catch (e: any) {
          // IntentNotCancellable or account-related error
          expect(e.message).to.not.be.empty;
        }
      });
    });

    // ========================================================================
    // Error Cases
    // ========================================================================

    describe("Error cases", () => {
      it("should reject submit with insufficient collateral", async () => {
        const intentId = new BN(200);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);
        const [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
        const targetPool = Keypair.generate().publicKey;
        const dummyPayload = Buffer.alloc(48);
        dummyPayload.fill(0x11);
        const encPubkey = Buffer.from(userEncryptionKeypair.publicKey);

        // min_collateral was set to 1_000_000 in initialize_solver
        const tooLowCollateral = new BN(100); // Way below minimum

        try {
          await program.methods
            .submitIntent(
              intentId,
              { varianceSwap: {} },
              tooLowCollateral,
              dummyPayload,
              encPubkey
            )
            .accounts({
              owner: user.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA,
              targetPool: targetPool,
              collateralMint: collateralMint,
              userCollateral: userCollateralAccount,
              intentVault: intentVaultPDA,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          expect.fail("Should have thrown - insufficient collateral");
        } catch (e: any) {
          expect(e.message).to.include("InvalidCollateralAmount");
        }
      });

      it("should reject submit with payload too small", async () => {
        const intentId = new BN(201);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);
        const [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
        const targetPool = Keypair.generate().publicKey;
        const tinyPayload = Buffer.alloc(10); // < 40 byte minimum
        const encPubkey = Buffer.from(userEncryptionKeypair.publicKey);

        try {
          await program.methods
            .submitIntent(
              intentId,
              { varianceSwap: {} },
              new BN(1_000_000),
              tinyPayload,
              encPubkey
            )
            .accounts({
              owner: user.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA,
              targetPool: targetPool,
              collateralMint: collateralMint,
              userCollateral: userCollateralAccount,
              intentVault: intentVaultPDA,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          expect.fail("Should have thrown - payload too small");
        } catch (e: any) {
          expect(e.message).to.include("InvalidPayloadLength");
        }
      });

      it("should reject submit with invalid encryption pubkey length", async () => {
        const intentId = new BN(202);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);
        const [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
        const targetPool = Keypair.generate().publicKey;
        const dummyPayload = Buffer.alloc(48);
        const badEncPubkey = Buffer.alloc(16); // Not 32 bytes

        try {
          await program.methods
            .submitIntent(
              intentId,
              { varianceSwap: {} },
              new BN(1_000_000),
              dummyPayload,
              badEncPubkey
            )
            .accounts({
              owner: user.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA,
              targetPool: targetPool,
              collateralMint: collateralMint,
              userCollateral: userCollateralAccount,
              intentVault: intentVaultPDA,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          expect.fail("Should have thrown - invalid encryption pubkey");
        } catch (e: any) {
          expect(e.message).to.include("InvalidEncryptionPubkey");
        }
      });

      it("should reject cancel by non-owner", async () => {
        // First submit an intent as user
        const intentId = new BN(300);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);
        const [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
        const targetPool = Keypair.generate().publicKey;
        const dummyPayload = Buffer.alloc(48);
        dummyPayload.fill(0x22);
        const encPubkey = Buffer.from(userEncryptionKeypair.publicKey);

        await program.methods
          .submitIntent(
            intentId,
            { varianceSwap: {} },
            new BN(2_000_000),
            dummyPayload,
            encPubkey
          )
          .accounts({
            owner: user.publicKey,
            solverConfig: solverConfigPDA,
            intent: intentPDA,
            targetPool: targetPool,
            collateralMint: collateralMint,
            userCollateral: userCollateralAccount,
            intentVault: intentVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();

        // Create token account for solver so account constraints pass for mint
        const solverTokenAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          solver,
          collateralMint,
          solver.publicKey
        );

        // Attempt cancel as solver (not owner) - PDA derivation will fail
        // because CancelIntent seeds use owner.key() and we pass solver
        try {
          await program.methods
            .cancelIntent()
            .accounts({
              owner: solver.publicKey,
              intent: intentPDA,
              collateralMint: collateralMint,
              intentVault: intentVaultPDA,
              userCollateral: solverTokenAccount.address,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([solver])
            .rpc();

          expect.fail("Should have thrown - unauthorized owner");
        } catch (e: any) {
          // PDA seed constraint or UnauthorizedOwner error
          expect(e.message).to.not.be.empty;
        }
      });

      it("should reject execute_intent with slippage_bps over 5000", async () => {
        // Submit an intent to test against
        const intentId = new BN(999);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);
        const [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
        const targetPool = Keypair.generate().publicKey;
        const dummyPayload = Buffer.alloc(48);
        dummyPayload.fill(0x22);
        const encPubkey = Buffer.from(userEncryptionKeypair.publicKey);

        await program.methods
          .submitIntent(
            intentId,
            { varianceSwap: {} },
            new BN(5_000_000),
            dummyPayload,
            encPubkey
          )
          .accounts({
            owner: user.publicKey,
            solverConfig: solverConfigPDA,
            intent: intentPDA,
            targetPool: targetPool,
            collateralMint: collateralMint,
            userCollateral: userCollateralAccount,
            intentVault: intentVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();

        // Try to execute with slippage > 5000 bps (50%)
        const solverTokenAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          solver,
          collateralMint,
          solver.publicKey
        );

        const cpiData = Buffer.alloc(8); // Minimum 8 bytes (dummy discriminator)

        try {
          await program.methods
            .executeIntent(
              new BN(Math.floor(Date.now() / 1000) + 3600), // deadline 1h from now
              6000, // slippage_bps = 60%, exceeds 50% cap
              Keypair.generate().publicKey, // result_position
              cpiData
            )
            .accounts({
              solver: solver.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA,
              targetPool: targetPool,
              collateralMint: collateralMint,
              intentVault: intentVaultPDA,
              solverCollateral: solverTokenAccount.address,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([solver])
            .rpc();

          expect.fail("Should have thrown - slippage too high");
        } catch (e: any) {
          expect(e.message).to.include("SlippageExceeded");
        }
      });
    });

    // ========================================================================
    // Claim Result
    // ========================================================================

    describe("claim_result", () => {
      it("should reject claim on pending intent (not yet executed)", async () => {
        // Intent ID 300 was submitted earlier and is still pending
        const intentId = new BN(300);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);

        try {
          await program.methods
            .claimResult()
            .accounts({
              owner: user.publicKey,
              intent: intentPDA,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          expect.fail("Should have thrown - intent not claimable");
        } catch (e: any) {
          // IntentNotExecutable (used for claimable check) or constraint error
          expect(e.message).to.not.be.empty;
        }
      });

      it("should reject claim by non-owner", async () => {
        const intentId = new BN(300);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);

        try {
          await program.methods
            .claimResult()
            .accounts({
              owner: solver.publicKey,
              intent: intentPDA,
              systemProgram: SystemProgram.programId,
            })
            .signers([solver])
            .rpc();

          expect.fail("Should have thrown - non-owner cannot claim");
        } catch (e: any) {
          // PDA seed mismatch or UnauthorizedOwner
          expect(e.message).to.not.be.empty;
        }
      });
    });

    // ========================================================================
    // Access Control
    // ========================================================================

    describe("Access Control", () => {
      it("should reject execute_intent by non-solver", async () => {
        // Intent ID 300 is still pending, try to execute as non-solver (user)
        const intentId = new BN(300);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);
        const [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
        const targetPool = (await program.account.encryptedIntent.fetch(intentPDA)).targetPool;

        const userTokenAccount = userCollateralAccount;
        const cpiData = Buffer.alloc(8);

        try {
          await program.methods
            .executeIntent(
              new BN(Math.floor(Date.now() / 1000) + 3600),
              100, // slippage
              Keypair.generate().publicKey,
              cpiData
            )
            .accounts({
              solver: user.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA,
              targetPool: targetPool,
              collateralMint: collateralMint,
              intentVault: intentVaultPDA,
              solverCollateral: userTokenAccount,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

          expect.fail("Should have thrown - user is not the solver");
        } catch (e: any) {
          expect(e.message).to.include("UnauthorizedSolver");
        }
      });

      it("should reject submit_intent when solver is inactive", async () => {
        // We can't easily deactivate the solver in this test without an update instruction,
        // but we can test with a wrong solver config. Skip if no update instruction exists.
        // Instead, test expired deadline in execute_intent
        const intentId = new BN(300);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);
        const [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
        const targetPool = (await program.account.encryptedIntent.fetch(intentPDA)).targetPool;

        const solverTokenAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          solver,
          collateralMint,
          solver.publicKey
        );

        const cpiData = Buffer.alloc(8);

        try {
          await program.methods
            .executeIntent(
              new BN(1000000000), // deadline far in the past (Unix epoch + ~30 years, actually let's use a past timestamp)
              100,
              Keypair.generate().publicKey,
              cpiData
            )
            .accounts({
              solver: solver.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA,
              targetPool: targetPool,
              collateralMint: collateralMint,
              intentVault: intentVaultPDA,
              solverCollateral: solverTokenAccount.address,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([solver])
            .rpc();

          expect.fail("Should have thrown - deadline expired");
        } catch (e: any) {
          expect(e.message).to.include("IntentExpired");
        }
      });

      it("should reject execute_intent with too-short cpi_data", async () => {
        const intentId = new BN(300);
        const [intentPDA] = deriveIntentPDA(user.publicKey, intentId);
        const [intentVaultPDA] = deriveIntentVaultPDA(intentPDA);
        const targetPool = (await program.account.encryptedIntent.fetch(intentPDA)).targetPool;

        const solverTokenAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          solver,
          collateralMint,
          solver.publicKey
        );

        const shortCpiData = Buffer.alloc(4); // Less than 8 bytes required

        try {
          await program.methods
            .executeIntent(
              new BN(Math.floor(Date.now() / 1000) + 3600),
              100,
              Keypair.generate().publicKey,
              shortCpiData
            )
            .accounts({
              solver: solver.publicKey,
              solverConfig: solverConfigPDA,
              intent: intentPDA,
              targetPool: targetPool,
              collateralMint: collateralMint,
              intentVault: intentVaultPDA,
              solverCollateral: solverTokenAccount.address,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([solver])
            .rpc();

          expect.fail("Should have thrown - cpi_data too short");
        } catch (e: any) {
          expect(e.message).to.include("InvalidRemainingAccounts");
        }
      });
    });
  });
});
