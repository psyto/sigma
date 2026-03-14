/**
 * SDK-level tests for PrivateIntentClient integration.
 *
 * Tests that private intent functionality is accessible through the SDK
 * without importing from @sigma-protocol/private-intents directly.
 */
import BN from "bn.js";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import {
  SigmaClient,
  PrivateIntentClient,
  IntentType,
  IntentStatus,
  ExoticOptionType,
  CollateralSource,
  getIntentStatusName,
  getSchemaForIntentType,
  getOptionTypeName,
  // Encryption
  generateEncryptionKeypair,
  deriveEncryptionKeypair,
  encrypt,
  decrypt,
  encryptionKeyToBase58,
  base58ToEncryptionKey,
  validateEncryptedData,
  // Serialization
  serializeVarianceSwapIntent,
  deserializeVarianceSwapIntent,
  validateVarianceSwapIntent,
  serializeFundingSwapIntent,
  deserializeFundingSwapIntent,
  validateFundingSwapIntent,
  serializeExoticOptionIntent,
  deserializeExoticOptionIntent,
  validateExoticOptionIntent,
  calculateSchemaSize,
  VARIANCE_SWAP_SCHEMA,
  FUNDING_SWAP_SCHEMA,
  EXOTIC_OPTION_SCHEMA,
  PRIVATE_INTENTS_PROGRAM_ID,
  SEEDS,
  // Types
  EncryptedData,
} from "../index";

// Helper to create a mock wallet for testing
function createMockWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    payer: keypair,
    signTransaction: jest.fn(),
    signAllTransactions: jest.fn(),
  };
}

describe("PrivateIntentClient SDK integration", () => {
  describe("SDK exports", () => {
    it("should export PrivateIntentClient class", () => {
      expect(PrivateIntentClient).toBeDefined();
      expect(typeof PrivateIntentClient).toBe("function");
    });

    it("should export IntentType enum", () => {
      expect(IntentType).toBeDefined();
      expect(IntentType.VarianceSwap).toBe(0);
      expect(IntentType.FundingSwap).toBe(1);
      expect(IntentType.ExoticOption).toBe(2);
    });

    it("should export IntentStatus enum", () => {
      expect(IntentStatus).toBeDefined();
      expect(IntentStatus.Pending).toBe(0);
      expect(IntentStatus.Executing).toBe(1);
      expect(IntentStatus.Completed).toBe(2);
      expect(IntentStatus.Cancelled).toBe(3);
      expect(IntentStatus.Failed).toBe(4);
      expect(IntentStatus.BridgePending).toBe(5);
    });

    it("should export CollateralSource enum", () => {
      expect(CollateralSource).toBeDefined();
      expect(CollateralSource.Native).toBe(0);
      expect(CollateralSource.Ethereum).toBe(1);
      expect(CollateralSource.Arbitrum).toBe(2);
      expect(CollateralSource.Cctp).toBe(3);
    });

    it("should export ExoticOptionType enum", () => {
      expect(ExoticOptionType).toBeDefined();
      expect(ExoticOptionType.AsianCall).toBe(0);
      expect(ExoticOptionType.UpAndOutCall).toBe(2);
    });

    it("should export PRIVATE_INTENTS_PROGRAM_ID", () => {
      expect(PRIVATE_INTENTS_PROGRAM_ID).toBe(
        "AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow"
      );
    });

    it("should export SEEDS constants", () => {
      expect(SEEDS).toBeDefined();
      expect(SEEDS.SOLVER_CONFIG).toBeDefined();
      expect(SEEDS.ENCRYPTED_INTENT).toBeDefined();
      expect(SEEDS.INTENT_VAULT).toBeDefined();
    });

    it("should export encryption functions", () => {
      expect(typeof generateEncryptionKeypair).toBe("function");
      expect(typeof deriveEncryptionKeypair).toBe("function");
      expect(typeof encrypt).toBe("function");
      expect(typeof decrypt).toBe("function");
      expect(typeof encryptionKeyToBase58).toBe("function");
      expect(typeof base58ToEncryptionKey).toBe("function");
      expect(typeof validateEncryptedData).toBe("function");
    });

    it("should export intent serialization functions", () => {
      expect(typeof serializeVarianceSwapIntent).toBe("function");
      expect(typeof deserializeVarianceSwapIntent).toBe("function");
      expect(typeof validateVarianceSwapIntent).toBe("function");
      expect(typeof serializeFundingSwapIntent).toBe("function");
      expect(typeof deserializeFundingSwapIntent).toBe("function");
      expect(typeof validateFundingSwapIntent).toBe("function");
      expect(typeof serializeExoticOptionIntent).toBe("function");
      expect(typeof deserializeExoticOptionIntent).toBe("function");
      expect(typeof validateExoticOptionIntent).toBe("function");
    });

    it("should export schema constants", () => {
      expect(VARIANCE_SWAP_SCHEMA).toBeDefined();
      expect(FUNDING_SWAP_SCHEMA).toBeDefined();
      expect(EXOTIC_OPTION_SCHEMA).toBeDefined();
    });

    it("should export helper functions", () => {
      expect(typeof getIntentStatusName).toBe("function");
      expect(typeof getSchemaForIntentType).toBe("function");
      expect(typeof getOptionTypeName).toBe("function");
      expect(typeof calculateSchemaSize).toBe("function");
    });
  });

  describe("PrivateIntentClient standalone initialization", () => {
    it("should construct a PrivateIntentClient directly", () => {
      const wallet = createMockWallet();
      const connection = new Connection("http://127.0.0.1:8899");

      const client = new PrivateIntentClient(connection, wallet as any);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(PrivateIntentClient);
    });

    it("should have PROGRAM_ID defined", () => {
      expect(PrivateIntentClient.PROGRAM_ID).toBeDefined();
      expect(PrivateIntentClient.PROGRAM_ID.toBase58()).toBe(
        "AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow"
      );
    });
  });

  describe("Encryption round-trip", () => {
    it("should generate an encryption keypair", () => {
      const keypair = generateEncryptionKeypair();
      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.secretKey).toBeInstanceOf(Uint8Array);
      expect(keypair.publicKey.length).toBe(32);
      expect(keypair.secretKey.length).toBe(32);
    });

    it("should derive a deterministic keypair from secret", () => {
      const secret = new Uint8Array(32);
      secret[0] = 42;
      secret[1] = 7;

      const keypair1 = deriveEncryptionKeypair(secret);
      const keypair2 = deriveEncryptionKeypair(secret);

      expect(Buffer.from(keypair1.publicKey)).toEqual(
        Buffer.from(keypair2.publicKey)
      );
      expect(Buffer.from(keypair1.secretKey)).toEqual(
        Buffer.from(keypair2.secretKey)
      );
    });

    it("should encrypt and decrypt data successfully", () => {
      const sender = generateEncryptionKeypair();
      const receiver = generateEncryptionKeypair();

      const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      const encrypted = encrypt(plaintext, receiver.publicKey, sender);
      expect(encrypted).toBeDefined();
      expect(encrypted.bytes).toBeDefined();
      expect(encrypted.bytes.length).toBeGreaterThan(plaintext.length);

      // decrypt takes the raw bytes (nonce + ciphertext) from EncryptedData
      const decrypted = decrypt(encrypted.bytes, sender.publicKey, receiver);
      expect(Buffer.from(decrypted)).toEqual(Buffer.from(plaintext));
    });

    it("should fail to decrypt with wrong key", () => {
      const sender = generateEncryptionKeypair();
      const receiver = generateEncryptionKeypair();
      const wrongKey = generateEncryptionKeypair();

      const plaintext = new Uint8Array([10, 20, 30]);
      const encrypted = encrypt(plaintext, receiver.publicKey, sender);

      expect(() => {
        decrypt(encrypted.bytes, sender.publicKey, wrongKey);
      }).toThrow();
    });

    it("should round-trip encryption key through base58", () => {
      const keypair = generateEncryptionKeypair();
      const b58 = encryptionKeyToBase58(keypair.publicKey);
      expect(typeof b58).toBe("string");

      const restored = base58ToEncryptionKey(b58);
      expect(Buffer.from(restored)).toEqual(Buffer.from(keypair.publicKey));
    });

    it("should validate encrypted data structure", () => {
      const sender = generateEncryptionKeypair();
      const receiver = generateEncryptionKeypair();
      const plaintext = new Uint8Array([1, 2, 3]);
      const encrypted = encrypt(plaintext, receiver.publicKey, sender);

      expect(validateEncryptedData(encrypted.bytes)).toBe(true);
    });
  });

  describe("Intent serialization", () => {
    describe("Variance swap intent", () => {
      const intent = {
        notional: new BN(1_000_000_000),
        premiumLimit: new BN(50_000_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        isLong: true,
      };

      it("should serialize to correct size", () => {
        const bytes = serializeVarianceSwapIntent(intent);
        expect(bytes.length).toBe(40);
      });

      it("should round-trip serialize/deserialize", () => {
        const bytes = serializeVarianceSwapIntent(intent);
        const restored = deserializeVarianceSwapIntent(bytes);

        expect(restored.notional.toString()).toBe(intent.notional.toString());
        expect(restored.premiumLimit.toString()).toBe(
          intent.premiumLimit.toString()
        );
        expect(restored.strikeVarianceBps.toString()).toBe(
          intent.strikeVarianceBps.toString()
        );
        expect(restored.deadline).toBe(intent.deadline);
        expect(restored.slippageBps).toBe(intent.slippageBps);
        expect(restored.isLong).toBe(intent.isLong);
      });

      it("should validate a correct intent", () => {
        expect(() => validateVarianceSwapIntent(intent)).not.toThrow();
      });

      it("should reject invalid notional", () => {
        expect(() =>
          validateVarianceSwapIntent({ ...intent, notional: new BN(0) })
        ).toThrow("Notional must be positive");
      });
    });

    describe("Funding swap intent", () => {
      const intent = {
        notional: new BN(500_000_000),
        durationPeriods: 30,
        fixedRateLimitBps: 50,
        deadline: Math.floor(Date.now() / 1000) + 7200,
        slippageBps: 50,
        isReceiver: true,
      };

      it("should serialize to correct size", () => {
        const bytes = serializeFundingSwapIntent(intent);
        expect(bytes.length).toBe(26);
      });

      it("should round-trip serialize/deserialize", () => {
        const bytes = serializeFundingSwapIntent(intent);
        const restored = deserializeFundingSwapIntent(bytes);

        expect(restored.notional.toString()).toBe(intent.notional.toString());
        expect(restored.durationPeriods).toBe(intent.durationPeriods);
        expect(restored.fixedRateLimitBps).toBe(intent.fixedRateLimitBps);
        expect(restored.deadline).toBe(intent.deadline);
        expect(restored.slippageBps).toBe(intent.slippageBps);
        expect(restored.isReceiver).toBe(intent.isReceiver);
      });
    });

    describe("Exotic option intent", () => {
      const intent = {
        notional: new BN(2_000_000_000),
        strikePrice: new BN(50_000_000_000),
        barrierPrice: new BN(55_000_000_000),
        durationDays: 30,
        deadline: Math.floor(Date.now() / 1000) + 1800,
        slippageBps: 200,
        optionType: ExoticOptionType.UpAndOutCall,
      };

      it("should serialize to correct size", () => {
        const bytes = serializeExoticOptionIntent(intent);
        expect(bytes.length).toBe(42);
      });

      it("should round-trip serialize/deserialize", () => {
        const bytes = serializeExoticOptionIntent(intent);
        const restored = deserializeExoticOptionIntent(bytes);

        expect(restored.notional.toString()).toBe(intent.notional.toString());
        expect(restored.strikePrice.toString()).toBe(
          intent.strikePrice.toString()
        );
        expect(restored.barrierPrice.toString()).toBe(
          intent.barrierPrice.toString()
        );
        expect(restored.durationDays).toBe(intent.durationDays);
        expect(restored.optionType).toBe(intent.optionType);
      });
    });
  });

  describe("Schema utilities", () => {
    it("should calculate correct schema sizes", () => {
      expect(calculateSchemaSize(VARIANCE_SWAP_SCHEMA)).toBe(40);
      expect(calculateSchemaSize(FUNDING_SWAP_SCHEMA)).toBe(26);
      expect(calculateSchemaSize(EXOTIC_OPTION_SCHEMA)).toBe(42);
    });

    it("should get schema for each intent type", () => {
      const vs = getSchemaForIntentType(IntentType.VarianceSwap);
      expect(vs.name).toBe("Variance Swap");
      expect(vs.schema).toBe(VARIANCE_SWAP_SCHEMA);

      const fs = getSchemaForIntentType(IntentType.FundingSwap);
      expect(fs.name).toBe("Funding Swap");
      expect(fs.schema).toBe(FUNDING_SWAP_SCHEMA);

      const eo = getSchemaForIntentType(IntentType.ExoticOption);
      expect(eo.name).toBe("Exotic Option");
      expect(eo.schema).toBe(EXOTIC_OPTION_SCHEMA);
    });
  });

  describe("Helper functions", () => {
    it("should return human-readable intent status names", () => {
      expect(getIntentStatusName(IntentStatus.Pending)).toBe("Pending");
      expect(getIntentStatusName(IntentStatus.Executing)).toBe("Executing");
      expect(getIntentStatusName(IntentStatus.Completed)).toBe("Completed");
      expect(getIntentStatusName(IntentStatus.Cancelled)).toBe("Cancelled");
      expect(getIntentStatusName(IntentStatus.Failed)).toBe("Failed");
      expect(getIntentStatusName(IntentStatus.BridgePending)).toBe(
        "Bridge Pending"
      );
    });

    it("should return human-readable option type names", () => {
      expect(getOptionTypeName(ExoticOptionType.AsianCall)).toBe("Asian Call");
      expect(getOptionTypeName(ExoticOptionType.UpAndOutCall)).toBe(
        "Up-and-Out Call"
      );
    });
  });

  describe("End-to-end: encrypt a variance swap intent", () => {
    it("should encrypt and decrypt a full variance swap intent via SDK", () => {
      const sender = generateEncryptionKeypair();
      const receiver = generateEncryptionKeypair();

      // Build intent
      const intent = {
        notional: new BN(5_000_000_000),
        premiumLimit: new BN(100_000_000),
        strikeVarianceBps: new BN(7500),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 150,
        isLong: true,
      };

      // Serialize
      const serialized = serializeVarianceSwapIntent(intent);
      expect(serialized.length).toBe(40);

      // Encrypt
      const encrypted = encrypt(serialized, receiver.publicKey, sender);
      expect(encrypted.bytes.length).toBeGreaterThan(40);

      // Decrypt
      const decrypted = decrypt(encrypted.bytes, sender.publicKey, receiver);
      expect(decrypted.length).toBe(40);

      // Deserialize
      const restored = deserializeVarianceSwapIntent(decrypted);
      expect(restored.notional.toString()).toBe("5000000000");
      expect(restored.premiumLimit.toString()).toBe("100000000");
      expect(restored.strikeVarianceBps.toString()).toBe("7500");
      expect(restored.deadline).toBe(intent.deadline);
      expect(restored.slippageBps).toBe(150);
      expect(restored.isLong).toBe(true);
    });

    it("should encrypt and decrypt a funding swap intent via SDK", () => {
      const sender = generateEncryptionKeypair();
      const receiver = generateEncryptionKeypair();

      const intent = {
        notional: new BN(2_000_000_000),
        durationPeriods: 14,
        fixedRateLimitBps: -25,
        deadline: Math.floor(Date.now() / 1000) + 7200,
        slippageBps: 75,
        isReceiver: false,
      };

      const serialized = serializeFundingSwapIntent(intent);
      const encrypted = encrypt(serialized, receiver.publicKey, sender);
      const decrypted = decrypt(encrypted.bytes, sender.publicKey, receiver);
      const restored = deserializeFundingSwapIntent(decrypted);

      expect(restored.notional.toString()).toBe("2000000000");
      expect(restored.durationPeriods).toBe(14);
      expect(restored.fixedRateLimitBps).toBe(-25);
      expect(restored.isReceiver).toBe(false);
    });

    it("should encrypt and decrypt an exotic option intent via SDK", () => {
      const sender = generateEncryptionKeypair();
      const receiver = generateEncryptionKeypair();

      const intent = {
        notional: new BN(1_000_000_000),
        strikePrice: new BN(45_000_000_000),
        barrierPrice: new BN(50_000_000_000),
        durationDays: 60,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        optionType: ExoticOptionType.UpAndInCall,
      };

      const serialized = serializeExoticOptionIntent(intent);
      const encrypted = encrypt(serialized, receiver.publicKey, sender);
      const decrypted = decrypt(encrypted.bytes, sender.publicKey, receiver);
      const restored = deserializeExoticOptionIntent(decrypted);

      expect(restored.notional.toString()).toBe("1000000000");
      expect(restored.strikePrice.toString()).toBe("45000000000");
      expect(restored.barrierPrice.toString()).toBe("50000000000");
      expect(restored.durationDays).toBe(60);
      expect(restored.optionType).toBe(ExoticOptionType.UpAndInCall);
    });
  });

  describe("Client initialization", () => {
    it("should initialize PrivateIntentClient without encryption", () => {
      const wallet = createMockWallet();
      const connection = new Connection("http://127.0.0.1:8899");
      const client = new PrivateIntentClient(connection, wallet as any);

      expect(client.getEncryptionPublicKey()).toBeNull();
      expect(client.getSolverEncryptionPubkey()).toBeNull();
    });

    it("should initialize encryption on PrivateIntentClient", () => {
      const keypair = Keypair.generate();
      const wallet = {
        publicKey: keypair.publicKey,
        payer: keypair,
        signTransaction: jest.fn(),
        signAllTransactions: jest.fn(),
      };
      const connection = new Connection("http://127.0.0.1:8899");
      const client = new PrivateIntentClient(connection, wallet as any);

      client.initializeEncryption(keypair.secretKey);

      const encPubkey = client.getEncryptionPublicKey();
      expect(encPubkey).not.toBeNull();
      expect(encPubkey!.length).toBe(32);
    });

    it("should throw if encryption secret is too short", () => {
      const wallet = createMockWallet();
      const connection = new Connection("http://127.0.0.1:8899");
      const client = new PrivateIntentClient(connection, wallet as any);

      expect(() => {
        client.initializeEncryption(new Uint8Array(16));
      }).toThrow("Wallet secret must be at least 32 bytes");
    });
  });
});
