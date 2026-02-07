import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import { AnchorProvider, Wallet, BN, Program } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import {
  EncryptionKeypair,
  deriveEncryptionKeypair,
  encrypt,
  serializeVarianceSwapIntent,
  serializeFundingSwapIntent,
  serializeExoticOptionIntent,
  validateVarianceSwapIntent,
  validateFundingSwapIntent,
  validateExoticOptionIntent,
  VarianceSwapIntent,
  FundingSwapIntent,
  ExoticOptionIntent,
  IntentType,
  IntentStatus,
} from '../index';

/**
 * Parameters for submitting a private variance swap
 */
export interface PrivateVarianceSwapParams {
  targetPool: PublicKey;
  collateralMint: PublicKey;
  notional: BN;
  premiumLimit: BN;
  strikeVarianceBps: BN;
  deadline: number;
  slippageBps: number;
  isLong: boolean;
}

/**
 * Parameters for submitting a private funding swap
 */
export interface PrivateFundingSwapParams {
  targetPool: PublicKey;
  collateralMint: PublicKey;
  notional: BN;
  durationPeriods: number;
  fixedRateLimitBps: number;
  deadline: number;
  slippageBps: number;
  isReceiver: boolean;
}

/**
 * Parameters for submitting a private exotic option
 */
export interface PrivateExoticOptionParams {
  targetVault: PublicKey;
  collateralMint: PublicKey;
  notional: BN;
  strikePrice: BN;
  barrierPrice: BN;
  durationDays: number;
  deadline: number;
  slippageBps: number;
  optionType: number;
}

/**
 * Submitted intent info
 */
export interface SubmittedIntent {
  intentId: BN;
  intentPubkey: PublicKey;
  signature: string;
}

/**
 * Client for submitting private derivative intents
 *
 * Handles encryption, key registration, and intent submission
 */
export class PrivateIntentClient {
  private connection: Connection;
  private wallet: Wallet;
  private provider: AnchorProvider;
  private encryptionKeypair: EncryptionKeypair | null = null;
  private solverEncryptionPubkey: Uint8Array | null = null;
  private solverApiUrl: string | null = null;
  private intentCounter: BN = new BN(0);

  // Program ID for private-intents
  public static readonly PROGRAM_ID = new PublicKey(
    'AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow'
  );

  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection;
    this.wallet = wallet;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
  }

  /**
   * Initialize encryption keypair from wallet secret
   * Derives a deterministic X25519 keypair from the first 32 bytes of the wallet secret
   *
   * @param walletSecret - The wallet's secret key (64 bytes)
   */
  initializeEncryption(walletSecret: Uint8Array): void {
    if (walletSecret.length < 32) {
      throw new Error('Wallet secret must be at least 32 bytes');
    }
    this.encryptionKeypair = deriveEncryptionKeypair(walletSecret);
    console.log(
      `Encryption keypair initialized: ${Buffer.from(this.encryptionKeypair.publicKey).toString('hex').slice(0, 16)}...`
    );
  }

  /**
   * Register encryption pubkey with solver and get solver's pubkey
   *
   * @param solverApiUrl - URL of the solver API (e.g., https://solver.sigma.fi)
   */
  async registerWithSolver(solverApiUrl: string): Promise<void> {
    if (!this.encryptionKeypair) {
      throw new Error('Encryption not initialized. Call initializeEncryption first.');
    }

    this.solverApiUrl = solverApiUrl;

    // Get solver's encryption pubkey
    const solverPubkeyResponse = await fetch(`${solverApiUrl}/api/solver-pubkey`);
    if (!solverPubkeyResponse.ok) {
      throw new Error('Failed to fetch solver pubkey');
    }
    const solverPubkeyData = await solverPubkeyResponse.json();
    this.solverEncryptionPubkey = new Uint8Array(
      Buffer.from(solverPubkeyData.encryptionPubkey, 'hex')
    );

    // Register our pubkey with solver
    const registerResponse = await fetch(
      `${solverApiUrl}/api/register-encryption-pubkey`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: this.wallet.publicKey.toBase58(),
          encryptionPubkey: Buffer.from(this.encryptionKeypair.publicKey).toString('hex'),
        }),
      }
    );

    if (!registerResponse.ok) {
      throw new Error('Failed to register encryption pubkey with solver');
    }

    console.log('Successfully registered with solver');
  }

  /**
   * Submit a private variance swap intent
   */
  async submitPrivateVarianceSwap(
    params: PrivateVarianceSwapParams
  ): Promise<SubmittedIntent> {
    this.ensureReady();

    // Build and validate intent
    const intent: VarianceSwapIntent = {
      notional: params.notional,
      premiumLimit: params.premiumLimit,
      strikeVarianceBps: params.strikeVarianceBps,
      deadline: params.deadline,
      slippageBps: params.slippageBps,
      isLong: params.isLong,
    };
    validateVarianceSwapIntent(intent);

    // Serialize and encrypt
    const serialized = serializeVarianceSwapIntent(intent);
    const encrypted = encrypt(
      serialized,
      this.solverEncryptionPubkey!,
      this.encryptionKeypair!
    );

    return this.submitIntent(
      IntentType.VarianceSwap,
      params.targetPool,
      params.collateralMint,
      params.notional, // collateral = notional for variance swaps
      encrypted.bytes
    );
  }

  /**
   * Submit a private funding swap intent
   */
  async submitPrivateFundingSwap(
    params: PrivateFundingSwapParams
  ): Promise<SubmittedIntent> {
    this.ensureReady();

    // Build and validate intent
    const intent: FundingSwapIntent = {
      notional: params.notional,
      durationPeriods: params.durationPeriods,
      fixedRateLimitBps: params.fixedRateLimitBps,
      deadline: params.deadline,
      slippageBps: params.slippageBps,
      isReceiver: params.isReceiver,
    };
    validateFundingSwapIntent(intent);

    // Serialize and encrypt
    const serialized = serializeFundingSwapIntent(intent);
    const encrypted = encrypt(
      serialized,
      this.solverEncryptionPubkey!,
      this.encryptionKeypair!
    );

    return this.submitIntent(
      IntentType.FundingSwap,
      params.targetPool,
      params.collateralMint,
      params.notional,
      encrypted.bytes
    );
  }

  /**
   * Submit a private exotic option intent
   */
  async submitPrivateExoticOption(
    params: PrivateExoticOptionParams
  ): Promise<SubmittedIntent> {
    this.ensureReady();

    // Build and validate intent
    const intent: ExoticOptionIntent = {
      notional: params.notional,
      strikePrice: params.strikePrice,
      barrierPrice: params.barrierPrice,
      durationDays: params.durationDays,
      deadline: params.deadline,
      slippageBps: params.slippageBps,
      optionType: params.optionType,
    };
    validateExoticOptionIntent(intent);

    // Serialize and encrypt
    const serialized = serializeExoticOptionIntent(intent);
    const encrypted = encrypt(
      serialized,
      this.solverEncryptionPubkey!,
      this.encryptionKeypair!
    );

    return this.submitIntent(
      IntentType.ExoticOption,
      params.targetVault,
      params.collateralMint,
      params.notional,
      encrypted.bytes
    );
  }

  /**
   * Cancel a pending intent
   */
  async cancelIntent(intentId: BN): Promise<string> {
    const [intentPda] = this.findIntentPda(intentId);

    // TODO: Build and send cancel_intent instruction
    console.log(`Cancelling intent ${intentId.toString()}`);

    return 'cancel_signature_placeholder';
  }

  /**
   * Get intent status
   */
  async getIntentStatus(intentId: BN): Promise<IntentStatus | null> {
    const [intentPda] = this.findIntentPda(intentId);

    // TODO: Fetch and deserialize intent account
    return null;
  }

  /**
   * Get all intents for current wallet
   */
  async getMyIntents(): Promise<any[]> {
    // TODO: Use getProgramAccounts with owner filter
    return [];
  }

  /**
   * Internal method to submit an intent
   */
  private async submitIntent(
    intentType: IntentType,
    targetPool: PublicKey,
    collateralMint: PublicKey,
    collateralAmount: BN,
    encryptedPayload: Uint8Array
  ): Promise<SubmittedIntent> {
    const intentId = this.intentCounter;
    this.intentCounter = this.intentCounter.add(new BN(1));

    const [intentPda, intentBump] = this.findIntentPda(intentId);
    const [intentVaultPda] = this.findIntentVaultPda(intentPda);

    // Get user's token account
    const userCollateral = await getAssociatedTokenAddress(
      collateralMint,
      this.wallet.publicKey
    );

    // TODO: Build and send submit_intent instruction
    console.log(`Submitting intent ${intentId.toString()}`);
    console.log(`  Type: ${IntentType[intentType]}`);
    console.log(`  Target: ${targetPool.toBase58()}`);
    console.log(`  Collateral: ${collateralAmount.toString()}`);
    console.log(`  Encrypted payload: ${encryptedPayload.length} bytes`);

    return {
      intentId,
      intentPubkey: intentPda,
      signature: 'submit_signature_placeholder',
    };
  }

  /**
   * Find intent PDA
   */
  private findIntentPda(intentId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('encrypted_intent'),
        this.wallet.publicKey.toBuffer(),
        intentId.toArrayLike(Buffer, 'le', 8),
      ],
      PrivateIntentClient.PROGRAM_ID
    );
  }

  /**
   * Find intent vault PDA
   */
  private findIntentVaultPda(intentPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('intent_vault'), intentPubkey.toBuffer()],
      PrivateIntentClient.PROGRAM_ID
    );
  }

  /**
   * Ensure client is ready for operations
   */
  private ensureReady(): void {
    if (!this.encryptionKeypair) {
      throw new Error('Encryption not initialized. Call initializeEncryption first.');
    }
    if (!this.solverEncryptionPubkey) {
      throw new Error('Not registered with solver. Call registerWithSolver first.');
    }
  }

  /**
   * Get encryption public key
   */
  getEncryptionPublicKey(): Uint8Array | null {
    return this.encryptionKeypair?.publicKey || null;
  }

  /**
   * Get solver's encryption public key
   */
  getSolverEncryptionPubkey(): Uint8Array | null {
    return this.solverEncryptionPubkey;
  }
}
