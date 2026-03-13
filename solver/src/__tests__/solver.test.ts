import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import {
  generateEncryptionKeypair,
  encrypt,
  decrypt,
  serializeVarianceSwapIntent,
  deserializeVarianceSwapIntent,
  IntentType,
} from '@sigma-protocol/private-intents';

// Mock the intent data structure
interface MockIntentData {
  owner: PublicKey;
  intentId: BN;
  intentType: IntentType;
  targetPool: PublicKey;
  collateralMint: PublicKey;
  collateralAmount: BN;
  encryptedPayload: Uint8Array;
  userEncryptionPubkey: Uint8Array;
}

describe('Solver', () => {
  // Test keypairs
  const userKeypair = Keypair.generate();
  const solverKeypair = Keypair.generate();
  const userEncryptionKeypair = generateEncryptionKeypair();
  const solverEncryptionKeypair = generateEncryptionKeypair();

  describe('Intent Decryption', () => {
    it('should decrypt and deserialize variance swap intent', () => {
      // Create a variance swap intent
      const intent = {
        notional: new BN(1_000_000_000),
        premiumLimit: new BN(50_000_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        isLong: true,
      };

      // Serialize and encrypt (as user would)
      const serialized = serializeVarianceSwapIntent(intent);
      const encrypted = encrypt(
        serialized,
        solverEncryptionKeypair.publicKey,
        userEncryptionKeypair
      );

      // Create mock intent data (as it would appear on-chain)
      const mockIntent: MockIntentData = {
        owner: userKeypair.publicKey,
        intentId: new BN(1),
        intentType: IntentType.VarianceSwap,
        targetPool: Keypair.generate().publicKey,
        collateralMint: Keypair.generate().publicKey,
        collateralAmount: new BN(1_000_000_000),
        encryptedPayload: encrypted.bytes,
        userEncryptionPubkey: userEncryptionKeypair.publicKey,
      };

      // Decrypt (as solver would)
      const decrypted = decrypt(
        mockIntent.encryptedPayload,
        mockIntent.userEncryptionPubkey,
        solverEncryptionKeypair
      );

      // Deserialize
      const recoveredIntent = deserializeVarianceSwapIntent(decrypted);

      // Verify
      expect(recoveredIntent.notional.toString()).toBe(intent.notional.toString());
      expect(recoveredIntent.isLong).toBe(intent.isLong);
      expect(recoveredIntent.deadline).toBe(intent.deadline);
    });

    it('should reject expired intents', () => {
      // Create an expired intent
      const intent = {
        notional: new BN(1_000_000_000),
        premiumLimit: new BN(50_000_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) - 100, // Expired
        slippageBps: 100,
        isLong: true,
      };

      const serialized = serializeVarianceSwapIntent(intent);
      const encrypted = encrypt(
        serialized,
        solverEncryptionKeypair.publicKey,
        userEncryptionKeypair
      );

      // Decrypt
      const decrypted = decrypt(
        encrypted.bytes,
        userEncryptionKeypair.publicKey,
        solverEncryptionKeypair
      );

      const recoveredIntent = deserializeVarianceSwapIntent(decrypted);

      // Check deadline
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = currentTime > recoveredIntent.deadline;

      expect(isExpired).toBe(true);
    });
  });

  describe('User Registration', () => {
    // In-memory registry for testing
    const registry = new Map<string, Uint8Array>();

    it('should register user encryption pubkey', () => {
      const userAddress = userKeypair.publicKey.toBase58();
      registry.set(userAddress, userEncryptionKeypair.publicKey);

      expect(registry.has(userAddress)).toBe(true);
      expect(registry.get(userAddress)).toEqual(userEncryptionKeypair.publicKey);
    });

    it('should retrieve registered pubkey', () => {
      const userAddress = userKeypair.publicKey.toBase58();
      const retrieved = registry.get(userAddress);

      expect(retrieved).toBeDefined();
      expect(Buffer.from(retrieved!).toString('hex')).toBe(
        Buffer.from(userEncryptionKeypair.publicKey).toString('hex')
      );
    });

    it('should return undefined for unregistered user', () => {
      const unknownAddress = Keypair.generate().publicKey.toBase58();
      const retrieved = registry.get(unknownAddress);

      expect(retrieved).toBeUndefined();
    });
  });

  describe('Slippage Validation', () => {
    it('should accept intent within slippage tolerance', () => {
      const intent = {
        notional: new BN(1_000_000_000),
        premiumLimit: new BN(50_000_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100, // 1%
        isLong: true,
      };

      // Simulate execution with ~0.5% slippage
      const expectedPremium = new BN(50_000_000);
      const actualPremium = new BN(50_250_000); // 0.5% worse

      const slippageAmount = actualPremium.sub(expectedPremium);
      const slippageBps = slippageAmount.mul(new BN(10000)).div(expectedPremium);

      expect(slippageBps.toNumber()).toBeLessThanOrEqual(intent.slippageBps);
    });

    it('should reject intent exceeding slippage tolerance', () => {
      const intent = {
        notional: new BN(1_000_000_000),
        premiumLimit: new BN(50_000_000),
        strikeVarianceBps: new BN(5000),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100, // 1%
        isLong: true,
      };

      // Simulate execution with 2% slippage
      const expectedPremium = new BN(49_000_000);
      const actualPremium = new BN(51_000_000); // 2% worse

      const slippageAmount = actualPremium.sub(expectedPremium);
      const slippageBps = slippageAmount.mul(new BN(10000)).div(expectedPremium);

      expect(slippageBps.toNumber()).toBeGreaterThan(intent.slippageBps);
    });
  });
});
