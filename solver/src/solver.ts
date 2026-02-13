import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import { AnchorProvider, Wallet, BN, Program } from '@coral-xyz/anchor';
import {
  EncryptionKeypair,
  generateEncryptionKeypair,
  decrypt,
  deserializeVarianceSwapIntent,
  deserializeFundingSwapIntent,
  deserializeExoticOptionIntent,
  IntentType,
  IntentStatus,
} from '@sigma-protocol/private-intents';
import { VolswapExecutor } from './executors/volswap';
import { FundingExecutor } from './executors/funding';
import { ExoticExecutor } from './executors/exotic';

// In-memory registry for user encryption pubkeys
export const userEncryptionPubkeyRegistry: Map<string, Uint8Array> = new Map();

/**
 * Solver configuration
 */
export interface SolverConfig {
  rpcUrl: string;
  keypair: Keypair;
  encryptionKeypair: EncryptionKeypair;
  pollIntervalMs: number;
  maxSlippageBps: number;
  idls?: {
    volswap?: any;
    fundingSwap?: any;
    exoticVault?: any;
  };
}

/**
 * On-chain intent data
 */
export interface IntentData {
  owner: PublicKey;
  intentId: BN;
  intentType: IntentType;
  targetPool: PublicKey;
  collateralMint: PublicKey;
  collateralAmount: BN;
  encryptedPayload: Uint8Array;
  userEncryptionPubkey: Uint8Array;
  status: IntentStatus;
  createdAt: BN;
}

/**
 * Intent execution result
 */
export interface ExecutionResult {
  intentId: BN;
  owner: PublicKey;
  intentType: IntentType;
  resultPosition: PublicKey;
  executeSignature: string;
  success: boolean;
  error?: string;
}

/**
 * Private Intent Solver for Sigma Derivatives
 *
 * Monitors pending intents, decrypts them, and executes via CPI to Sigma programs.
 */
export class PrivateIntentSolver {
  private connection: Connection;
  private wallet: Wallet;
  private config: SolverConfig;
  private isRunning: boolean = false;
  private processedIntents: Set<string> = new Set();

  // Executors for each derivative type
  private volswapExecutor: VolswapExecutor;
  private fundingExecutor: FundingExecutor;
  private exoticExecutor: ExoticExecutor;

  constructor(config: SolverConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.wallet = new Wallet(config.keypair);

    const provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: 'confirmed',
    });

    // Initialize executors with IDLs
    this.volswapExecutor = new VolswapExecutor(provider, config.idls?.volswap);
    this.fundingExecutor = new FundingExecutor(provider, config.idls?.fundingSwap);
    this.exoticExecutor = new ExoticExecutor(provider, config.idls?.exoticVault);
  }

  /**
   * Get the solver's encryption public key
   */
  getEncryptionPublicKey(): Uint8Array {
    return this.config.encryptionKeypair.publicKey;
  }

  /**
   * Start the solver service
   */
  async start(): Promise<void> {
    console.log('Starting Private Intent Solver...');
    console.log(`Solver address: ${this.wallet.publicKey.toBase58()}`);
    console.log(
      `Encryption pubkey: ${Buffer.from(this.getEncryptionPublicKey()).toString('hex')}`
    );

    this.isRunning = true;

    while (this.isRunning) {
      try {
        await this.processPendingIntents();
      } catch (error) {
        console.error('Error processing intents:', error);
      }

      await this.sleep(this.config.pollIntervalMs);
    }
  }

  /**
   * Stop the solver service
   */
  stop(): void {
    console.log('Stopping solver...');
    this.isRunning = false;
  }

  /**
   * Process all pending intents
   */
  private async processPendingIntents(): Promise<void> {
    const pendingIntents = await this.fetchPendingIntents();

    for (const intent of pendingIntents) {
      const intentKey = `${intent.owner.toBase58()}-${intent.intentId.toString()}`;

      // Skip already processed intents
      if (this.processedIntents.has(intentKey)) {
        continue;
      }

      try {
        const result = await this.executeIntent(intent);
        this.processedIntents.add(intentKey);

        if (result.success) {
          console.log(
            `Intent ${intent.intentId.toString()} executed successfully`
          );
          console.log(`  Result position: ${result.resultPosition.toBase58()}`);
        } else {
          console.log(
            `Intent ${intent.intentId.toString()} failed: ${result.error}`
          );
        }
      } catch (error) {
        console.error(
          `Failed to execute intent ${intent.intentId.toString()}:`,
          error
        );
      }
    }
  }

  /**
   * Fetch all pending intents from the program
   */
  private async fetchPendingIntents(): Promise<IntentData[]> {
    // TODO: Implement fetching from the private-intents program
    // This would use getProgramAccounts with a filter for pending status
    console.log('Fetching pending intents...');
    return [];
  }

  /**
   * Execute a single intent
   */
  private async executeIntent(intent: IntentData): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      intentId: intent.intentId,
      owner: intent.owner,
      intentType: intent.intentType,
      resultPosition: PublicKey.default,
      executeSignature: '',
      success: false,
    };

    try {
      // Step 1: Get user's encryption pubkey
      const userEncryptionPubkey = await this.getUserEncryptionPubkey(
        intent.owner
      );

      // Step 2: Decrypt the intent payload
      const decryptedPayload = decrypt(
        intent.encryptedPayload,
        userEncryptionPubkey,
        this.config.encryptionKeypair
      );

      // Step 3: Deserialize based on intent type
      let deadline: number;
      let slippageBps: number;

      switch (intent.intentType) {
        case IntentType.VarianceSwap: {
          const params = deserializeVarianceSwapIntent(decryptedPayload);
          deadline = params.deadline;
          slippageBps = params.slippageBps;

          // Check if order is still valid
          const currentTime = Math.floor(Date.now() / 1000);
          if (currentTime > deadline) {
            result.error = 'Intent expired';
            return result;
          }

          // Execute via volswap executor
          const execResult = await this.volswapExecutor.execute(
            intent,
            params,
            this.wallet
          );
          result.resultPosition = execResult.positionPubkey;
          result.executeSignature = execResult.signature;
          break;
        }

        case IntentType.FundingSwap: {
          const params = deserializeFundingSwapIntent(decryptedPayload);
          deadline = params.deadline;
          slippageBps = params.slippageBps;

          const currentTime = Math.floor(Date.now() / 1000);
          if (currentTime > deadline) {
            result.error = 'Intent expired';
            return result;
          }

          const execResult = await this.fundingExecutor.execute(
            intent,
            params,
            this.wallet
          );
          result.resultPosition = execResult.positionPubkey;
          result.executeSignature = execResult.signature;
          break;
        }

        case IntentType.ExoticOption: {
          const params = deserializeExoticOptionIntent(decryptedPayload);
          deadline = params.deadline;
          slippageBps = params.slippageBps;

          const currentTime = Math.floor(Date.now() / 1000);
          if (currentTime > deadline) {
            result.error = 'Intent expired';
            return result;
          }

          const execResult = await this.exoticExecutor.execute(
            intent,
            params,
            this.wallet
          );
          result.resultPosition = execResult.positionPubkey;
          result.executeSignature = execResult.signature;
          break;
        }

        default:
          result.error = `Unknown intent type: ${intent.intentType}`;
          return result;
      }

      result.success = true;
      return result;
    } catch (error: any) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Get user's encryption public key from registry
   */
  private async getUserEncryptionPubkey(
    userAddress: PublicKey
  ): Promise<Uint8Array> {
    const userAddressStr = userAddress.toBase58();
    const encryptionPubkey = userEncryptionPubkeyRegistry.get(userAddressStr);

    if (!encryptionPubkey) {
      throw new Error(
        `User encryption pubkey not found for ${userAddressStr}. User must register via /api/register-encryption-pubkey`
      );
    }

    return encryptionPubkey;
  }

  /**
   * Register a user's encryption public key
   */
  static registerUserEncryptionPubkey(
    userAddress: string,
    encryptionPubkey: Uint8Array
  ): void {
    userEncryptionPubkeyRegistry.set(userAddress, encryptionPubkey);
    console.log(`Registered encryption pubkey for user: ${userAddress}`);
  }

  /**
   * Get count of registered users
   */
  static getRegisteredUserCount(): number {
    return userEncryptionPubkeyRegistry.size;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create solver configuration from environment
 */
export function createSolverConfig(): SolverConfig {
  const keypairPath = process.env.SOLVER_KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error('SOLVER_KEYPAIR_PATH environment variable required');
  }

  const keypairJson = require(keypairPath);
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairJson));

  // Generate or load encryption keypair
  const encryptionKeypair = generateEncryptionKeypair();

  return {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    keypair,
    encryptionKeypair,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000'),
    maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || '100'),
  };
}
