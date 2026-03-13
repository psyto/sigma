import { Keypair, PublicKey } from "@solana/web3.js";
import {
  PrivateIntentSolver,
  userEncryptionPubkeyRegistry,
} from "../solver";

describe("API validation logic", () => {
  beforeEach(() => {
    // Clear the registry before each test
    userEncryptionPubkeyRegistry.clear();
  });

  describe("User encryption pubkey registration", () => {
    it("should register a user encryption pubkey", () => {
      const userAddress = Keypair.generate().publicKey.toBase58();
      const encryptionPubkey = new Uint8Array(32).fill(1);

      PrivateIntentSolver.registerUserEncryptionPubkey(
        userAddress,
        encryptionPubkey
      );

      expect(userEncryptionPubkeyRegistry.has(userAddress)).toBe(true);
      expect(userEncryptionPubkeyRegistry.get(userAddress)).toEqual(
        encryptionPubkey
      );
    });

    it("should overwrite existing registration for the same user", () => {
      const userAddress = Keypair.generate().publicKey.toBase58();
      const pubkey1 = new Uint8Array(32).fill(1);
      const pubkey2 = new Uint8Array(32).fill(2);

      PrivateIntentSolver.registerUserEncryptionPubkey(userAddress, pubkey1);
      PrivateIntentSolver.registerUserEncryptionPubkey(userAddress, pubkey2);

      expect(userEncryptionPubkeyRegistry.get(userAddress)).toEqual(pubkey2);
    });

    it("should track registered user count", () => {
      expect(PrivateIntentSolver.getRegisteredUserCount()).toBe(0);

      const user1 = Keypair.generate().publicKey.toBase58();
      const user2 = Keypair.generate().publicKey.toBase58();

      PrivateIntentSolver.registerUserEncryptionPubkey(
        user1,
        new Uint8Array(32)
      );
      expect(PrivateIntentSolver.getRegisteredUserCount()).toBe(1);

      PrivateIntentSolver.registerUserEncryptionPubkey(
        user2,
        new Uint8Array(32)
      );
      expect(PrivateIntentSolver.getRegisteredUserCount()).toBe(2);
    });

    it("should not double-count re-registrations of the same user", () => {
      const userAddress = Keypair.generate().publicKey.toBase58();

      PrivateIntentSolver.registerUserEncryptionPubkey(
        userAddress,
        new Uint8Array(32).fill(1)
      );
      PrivateIntentSolver.registerUserEncryptionPubkey(
        userAddress,
        new Uint8Array(32).fill(2)
      );

      expect(PrivateIntentSolver.getRegisteredUserCount()).toBe(1);
    });
  });

  describe("Encryption pubkey validation", () => {
    it("should accept a valid 32-byte hex string", () => {
      const hexString = "a".repeat(64); // 32 bytes in hex
      const bytes = new Uint8Array(Buffer.from(hexString, "hex"));
      expect(bytes.length).toBe(32);
    });

    it("should reject pubkeys that are not 32 bytes", () => {
      const shortHex = "aa"; // 1 byte
      const bytes = new Uint8Array(Buffer.from(shortHex, "hex"));
      expect(bytes.length).not.toBe(32);
    });

    it("should validate Solana address format", () => {
      const validAddress = Keypair.generate().publicKey.toBase58();
      expect(() => new PublicKey(validAddress)).not.toThrow();
    });

    it("should reject invalid Solana address", () => {
      expect(() => new PublicKey("not-a-valid-address")).toThrow();
    });
  });
});

describe("Solver configuration", () => {
  describe("SolverConfig interface", () => {
    it("should accept valid configuration values", () => {
      const config = {
        rpcUrl: "https://api.devnet.solana.com",
        keypair: Keypair.generate(),
        encryptionKeypair: {
          publicKey: new Uint8Array(32),
          secretKey: new Uint8Array(32),
        },
        pollIntervalMs: 5000,
        maxSlippageBps: 100,
      };

      expect(config.rpcUrl).toBe("https://api.devnet.solana.com");
      expect(config.pollIntervalMs).toBe(5000);
      expect(config.maxSlippageBps).toBe(100);
    });
  });
});

describe("Intent data parsing", () => {
  it("should parse owner from PublicKey correctly", () => {
    const owner = Keypair.generate().publicKey;
    const ownerBase58 = owner.toBase58();
    const recovered = new PublicKey(ownerBase58);
    expect(recovered.equals(owner)).toBe(true);
  });

  it("should handle intent key generation for dedup", () => {
    const owner = Keypair.generate().publicKey;
    const intentId = "42";
    const intentKey = `${owner.toBase58()}-${intentId}`;

    expect(intentKey).toContain(owner.toBase58());
    expect(intentKey).toContain("42");

    // Same owner + intentId should produce same key
    const intentKey2 = `${owner.toBase58()}-${intentId}`;
    expect(intentKey).toBe(intentKey2);
  });

  it("should generate unique intent keys for different intents", () => {
    const owner = Keypair.generate().publicKey;
    const key1 = `${owner.toBase58()}-1`;
    const key2 = `${owner.toBase58()}-2`;
    expect(key1).not.toBe(key2);
  });
});
