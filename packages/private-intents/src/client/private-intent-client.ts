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
    const solverPubkeyData = await solverPubkeyResponse.json() as { encryptionPubkey: string };
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
   * Cancel a pending intent and reclaim collateral
   *
   * Builds and sends the cancel_intent instruction which transfers collateral
   * back from the intent vault to the user's token account and closes the vault.
   */
  async cancelIntent(intentId: BN): Promise<string> {
    const [intentPda] = this.findIntentPda(intentId);
    const [intentVaultPda] = this.findIntentVaultPda(intentPda);

    // Fetch the intent account to get the collateral mint
    const intentAccountInfo = await this.connection.getAccountInfo(intentPda);
    if (!intentAccountInfo) {
      throw new Error(`Intent account not found: ${intentPda.toBase58()}`);
    }

    // Deserialize to get the collateral mint
    // Account layout: 8 (discriminator) + 32 (owner) + 8 (intent_id) + 1 (intent_type)
    // + 32 (target_pool) + 32 (collateral_mint) ...
    const data = intentAccountInfo.data;
    const collateralMint = new PublicKey(data.subarray(81, 113));

    const userCollateral = await getAssociatedTokenAddress(
      collateralMint,
      this.wallet.publicKey
    );

    // Build cancel_intent instruction
    // Instruction discriminator for cancel_intent (Anchor auto-generated)
    const discriminator = Buffer.from([
      // sha256("global:cancel_intent")[:8]
      0x23, 0xc3, 0xb4, 0x16, 0x8c, 0xd0, 0x47, 0x22,
    ]);

    const cancelIx = new TransactionInstruction({
      programId: PrivateIntentClient.PROGRAM_ID,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: intentPda, isSigner: false, isWritable: true },
        { pubkey: collateralMint, isSigner: false, isWritable: false },
        { pubkey: intentVaultPda, isSigner: false, isWritable: true },
        { pubkey: userCollateral, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: discriminator,
    });

    const transaction = new Transaction().add(cancelIx);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.wallet.payer],
      { commitment: 'confirmed' }
    );

    console.log(`Intent ${intentId.toString()} cancelled. Signature: ${signature}`);
    return signature;
  }

  /**
   * Get intent status
   *
   * Fetches the on-chain intent account and deserializes the status field.
   */
  async getIntentStatus(intentId: BN): Promise<IntentStatus | null> {
    const [intentPda] = this.findIntentPda(intentId);

    const accountInfo = await this.connection.getAccountInfo(intentPda);
    if (!accountInfo) {
      return null;
    }

    // Deserialize the status field from the intent account
    // Account layout (after 8-byte discriminator):
    //   owner: 32 bytes (offset 8)
    //   intent_id: 8 bytes (offset 40)
    //   intent_type: 1 byte (offset 48)
    //   target_pool: 32 bytes (offset 49)
    //   collateral_mint: 32 bytes (offset 81)
    //   collateral_amount: 8 bytes (offset 113)
    //   collateral_source: 1 byte (offset 121)
    //   vaa_hash: 4 (len) + up to 32 bytes (offset 122)
    //   After vaa_hash comes encrypted_payload (variable), user_encryption_pubkey (variable),
    //   then status (1 byte)
    //
    // We use a simplified approach: read the vaa_hash length to compute offset
    const data = accountInfo.data;
    const vaaHashLen = data.readUInt32LE(122);
    const encryptedPayloadOffset = 126 + vaaHashLen;
    const encryptedPayloadLen = data.readUInt32LE(encryptedPayloadOffset);
    const userPubkeyOffset = encryptedPayloadOffset + 4 + encryptedPayloadLen;
    const userPubkeyLen = data.readUInt32LE(userPubkeyOffset);
    const statusOffset = userPubkeyOffset + 4 + userPubkeyLen;

    const statusByte = data[statusOffset];
    return statusByte as IntentStatus;
  }

  /**
   * Get all intents for current wallet
   *
   * Uses getProgramAccounts with a memcmp filter on the owner field to find
   * all intent accounts belonging to the current wallet.
   */
  async getMyIntents(): Promise<any[]> {
    const accounts = await this.connection.getProgramAccounts(
      PrivateIntentClient.PROGRAM_ID,
      {
        commitment: 'confirmed',
        filters: [
          // Filter by account size (discriminator check - ensure it's an EncryptedIntent)
          // Use memcmp on the owner field (bytes 8..40 after the 8-byte Anchor discriminator)
          {
            memcmp: {
              offset: 8, // owner field starts after the 8-byte discriminator
              bytes: this.wallet.publicKey.toBase58(),
            },
          },
        ],
      }
    );

    return accounts.map((account) => {
      const data = account.account.data;
      // Parse the key fields from the account data
      const owner = new PublicKey(data.subarray(8, 40));
      const intentId = new BN(data.subarray(40, 48), 'le');
      const intentType = data[48] as IntentType;
      const targetPool = new PublicKey(data.subarray(49, 81));
      const collateralMint = new PublicKey(data.subarray(81, 113));
      const collateralAmount = new BN(data.subarray(113, 121), 'le');
      const collateralSource = data[121];

      // Parse variable-length fields to get to status
      const vaaHashLen = data.readUInt32LE(122);
      const vaaHash = data.subarray(126, 126 + vaaHashLen);
      const epOffset = 126 + vaaHashLen;
      const epLen = data.readUInt32LE(epOffset);
      const upkOffset = epOffset + 4 + epLen;
      const upkLen = data.readUInt32LE(upkOffset);
      const statusOffset = upkOffset + 4 + upkLen;
      const status = data[statusOffset] as IntentStatus;

      return {
        pubkey: account.pubkey,
        owner,
        intentId,
        intentType,
        targetPool,
        collateralMint,
        collateralAmount,
        collateralSource,
        status,
      };
    });
  }

  /**
   * Internal method to submit an intent
   *
   * Builds and sends the submit_intent instruction to the private-intents
   * program. This transfers collateral to the intent vault and stores the
   * encrypted payload on-chain for the solver to process.
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

    // Derive solver config PDA
    const [solverConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('solver_config')],
      PrivateIntentClient.PROGRAM_ID
    );

    // Get user's token account
    const userCollateral = await getAssociatedTokenAddress(
      collateralMint,
      this.wallet.publicKey
    );

    // Ensure the user's ATA exists; create it if not
    const ataInfo = await this.connection.getAccountInfo(userCollateral);
    const preInstructions: TransactionInstruction[] = [];
    if (!ataInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          userCollateral,
          this.wallet.publicKey,
          collateralMint
        )
      );
    }

    // Build the submit_intent instruction data
    // Anchor instruction format: 8-byte discriminator + serialized args
    // discriminator = sha256("global:submit_intent")[:8]
    const discriminator = Buffer.from([
      0xf7, 0x35, 0x5f, 0x41, 0x06, 0x53, 0x9e, 0x2c,
    ]);

    // Serialize arguments:
    // intent_id: u64 (8 bytes LE)
    // intent_type: u8 (1 byte - enum variant index)
    // collateral_amount: u64 (8 bytes LE)
    // encrypted_payload: Vec<u8> (4-byte length prefix + data)
    // user_encryption_pubkey: Vec<u8> (4-byte length prefix + data)
    const intentIdBuf = Buffer.alloc(8);
    intentId.toArrayLike(Buffer, 'le', 8).copy(intentIdBuf);

    const intentTypeBuf = Buffer.from([intentType]);

    const collateralAmountBuf = Buffer.alloc(8);
    collateralAmount.toArrayLike(Buffer, 'le', 8).copy(collateralAmountBuf);

    const payloadLenBuf = Buffer.alloc(4);
    payloadLenBuf.writeUInt32LE(encryptedPayload.length);

    const encryptionPubkey = this.encryptionKeypair!.publicKey;
    const pubkeyLenBuf = Buffer.alloc(4);
    pubkeyLenBuf.writeUInt32LE(encryptionPubkey.length);

    const instructionData = Buffer.concat([
      discriminator,
      intentIdBuf,
      intentTypeBuf,
      collateralAmountBuf,
      payloadLenBuf,
      Buffer.from(encryptedPayload),
      pubkeyLenBuf,
      Buffer.from(encryptionPubkey),
    ]);

    const submitIx = new TransactionInstruction({
      programId: PrivateIntentClient.PROGRAM_ID,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: solverConfigPda, isSigner: false, isWritable: false },
        { pubkey: intentPda, isSigner: false, isWritable: true },
        { pubkey: targetPool, isSigner: false, isWritable: false },
        { pubkey: collateralMint, isSigner: false, isWritable: false },
        { pubkey: userCollateral, isSigner: false, isWritable: true },
        { pubkey: intentVaultPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });

    const transaction = new Transaction();
    preInstructions.forEach((ix) => transaction.add(ix));
    transaction.add(submitIx);

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.wallet.payer],
      { commitment: 'confirmed' }
    );

    console.log(`Intent ${intentId.toString()} submitted successfully`);
    console.log(`  Type: ${IntentType[intentType]}`);
    console.log(`  Target: ${targetPool.toBase58()}`);
    console.log(`  Collateral: ${collateralAmount.toString()}`);
    console.log(`  Signature: ${signature}`);

    return {
      intentId,
      intentPubkey: intentPda,
      signature,
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
