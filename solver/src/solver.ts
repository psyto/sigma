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
   * Get the count of processed intents
   */
  getProcessedIntentCount(): number {
    return this.processedIntents.size;
  }

  /**
   * Get whether the solver is currently running
   */
  getIsRunning(): boolean {
    return this.isRunning;
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
   * Private intents program ID
   */
  private static readonly PROGRAM_ID = new PublicKey(
    'AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow'
  );

  /**
   * Fetch all pending intents from the private-intents program
   *
   * Uses getProgramAccounts with a memcmp filter to find all EncryptedIntent
   * accounts that have IntentStatus::Pending (0). The status field is located
   * after the variable-length fields, so we scan all intent accounts and
   * filter client-side for pending status.
   */
  private async fetchPendingIntents(): Promise<IntentData[]> {
    const accounts = await this.connection.getProgramAccounts(
      PrivateIntentSolver.PROGRAM_ID,
      {
        commitment: 'confirmed',
        // We fetch all accounts owned by the program and filter client-side
        // because the status field is after variable-length Vec fields,
        // making server-side memcmp filtering on status impractical.
        filters: [
          // EncryptedIntent discriminator would provide a more precise filter
          // but we use a minimum data size as a heuristic
          { dataSize: undefined as any }, // Omit dataSize to get all accounts
        ].filter(f => f.dataSize !== undefined),
      }
    );

    const pendingIntents: IntentData[] = [];

    for (const { pubkey, account } of accounts) {
      try {
        const data = account.data;

        // Minimum size check: discriminator(8) + owner(32) + intent_id(8) +
        // intent_type(1) + target_pool(32) + collateral_mint(32) +
        // collateral_amount(8) + collateral_source(1) = 122 bytes minimum
        if (data.length < 122) {
          continue;
        }

        // Parse fixed fields
        const owner = new PublicKey(data.subarray(8, 40));
        const intentId = new BN(data.subarray(40, 48), 'le');
        const intentType: IntentType = data[48];
        const targetPool = new PublicKey(data.subarray(49, 81));
        const collateralMint = new PublicKey(data.subarray(81, 113));
        const collateralAmount = new BN(data.subarray(113, 121), 'le');

        // Parse variable-length fields to reach the status byte
        // collateral_source: 1 byte at offset 121
        let offset = 122;

        // vaa_hash: Vec<u8> - 4 byte length prefix + data
        if (offset + 4 > data.length) continue;
        const vaaHashLen = data.readUInt32LE(offset);
        offset += 4 + vaaHashLen;

        // encrypted_payload: Vec<u8> - 4 byte length prefix + data
        if (offset + 4 > data.length) continue;
        const encryptedPayloadLen = data.readUInt32LE(offset);
        offset += 4;
        const encryptedPayload = new Uint8Array(data.subarray(offset, offset + encryptedPayloadLen));
        offset += encryptedPayloadLen;

        // user_encryption_pubkey: Vec<u8> - 4 byte length prefix + data
        if (offset + 4 > data.length) continue;
        const userPubkeyLen = data.readUInt32LE(offset);
        offset += 4;
        const userEncryptionPubkey = new Uint8Array(data.subarray(offset, offset + userPubkeyLen));
        offset += userPubkeyLen;

        // status: 1 byte
        if (offset >= data.length) continue;
        const status: IntentStatus = data[offset];

        // Only include pending intents
        if (status !== IntentStatus.Pending) {
          continue;
        }

        // Parse createdAt for logging
        const createdAtOffset = offset + 1;
        const createdAt = createdAtOffset + 8 <= data.length
          ? new BN(data.subarray(createdAtOffset, createdAtOffset + 8), 'le')
          : new BN(0);

        pendingIntents.push({
          owner,
          intentId,
          intentType,
          targetPool,
          collateralMint,
          collateralAmount,
          encryptedPayload,
          userEncryptionPubkey,
          status,
          createdAt,
        });
      } catch (error) {
        // Skip accounts that fail to parse (may be other account types)
        continue;
      }
    }

    if (pendingIntents.length > 0) {
      console.log(`Found ${pendingIntents.length} pending intent(s)`);
    }

    return pendingIntents;
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
