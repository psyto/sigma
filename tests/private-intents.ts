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

  // TODO: Add on-chain tests once program is built
  // describe("On-Chain Operations", () => {
  //   it("should initialize solver config", async () => {});
  //   it("should submit encrypted intent", async () => {});
  //   it("should execute intent (solver)", async () => {});
  //   it("should cancel intent (owner)", async () => {});
  //   it("should claim result (owner)", async () => {});
  // });
});
