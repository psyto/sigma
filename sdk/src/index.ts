/**
 * Sigma Protocol SDK
 *
 * A TypeScript SDK for interacting with Sigma Protocol - DeFi derivatives on Solana.
 *
 * @example
 * ```typescript
 * import { SigmaClient, OracleClient, VolswapClient } from "@sigma-protocol/sdk";
 * import { AnchorProvider } from "@coral-xyz/anchor";
 *
 * const provider = AnchorProvider.env();
 * const sigma = new SigmaClient(provider);
 *
 * // Get latest SOL price
 * const price = await sigma.oracle.getLatestPrice(SOL_MINT);
 *
 * // Open a variance swap position
 * await sigma.volswap.openLong(underlyingMint, collateralMint, userCollateral, notional, maxPremium);
 *
 * // Submit a private variance swap (encrypted)
 * await sigma.privateIntents.initializeEncryption(walletSecret);
 * await sigma.privateIntents.registerWithSolver('https://solver.sigma.fi');
 * await sigma.privateIntents.submitPrivateVarianceSwap({ ... });
 * ```
 */

import { AnchorProvider, Wallet, Idl } from "@coral-xyz/anchor";
import { Connection, Commitment, PublicKey } from "@solana/web3.js";
import { PrivateIntentClient } from "@sigma-protocol/private-intents";

// Re-export clients
export { OracleClient } from "./oracle";
export { VolswapClient, type PoolParams } from "./volswap";
export { FundingSwapClient, type FundingPoolParams } from "./funding-swap";
export { ExoticVaultClient, type VaultParams } from "./exotic-vault";

// Re-export PrivateIntentClient and related types from private-intents package
export {
  PrivateIntentClient,
  CrossChainClient,
  CollateralSource,
  IntentType,
  IntentStatus,
  getIntentStatusName,
  getSchemaForIntentType,
  // Encryption primitives
  encrypt,
  decrypt,
  generateEncryptionKeypair,
  deriveEncryptionKeypair,
  encryptForMultiple,
  encryptionKeyToBase58,
  base58ToEncryptionKey,
  validateEncryptedData,
  // Threshold encryption
  splitSecret,
  combineShares,
  verifyShares,
  createThresholdEncryption,
  decryptWithThreshold,
  // Payload serialization
  serializePayload,
  deserializePayload,
  calculateSchemaSize,
  // Intent schemas and serialization
  serializeVarianceSwapIntent,
  deserializeVarianceSwapIntent,
  validateVarianceSwapIntent,
  serializeFundingSwapIntent,
  deserializeFundingSwapIntent,
  validateFundingSwapIntent,
  serializeExoticOptionIntent,
  deserializeExoticOptionIntent,
  validateExoticOptionIntent,
  getOptionTypeName,
  ExoticOptionType,
  VARIANCE_SWAP_SCHEMA,
  FUNDING_SWAP_SCHEMA,
  EXOTIC_OPTION_SCHEMA,
  PRIVATE_INTENTS_PROGRAM_ID,
  SEEDS,
  // Wormhole
  WormholeClient,
} from "@sigma-protocol/private-intents";

// Re-export types from private-intents
export type {
  EncryptionKeypair,
  EncryptedData,
  SecretShare,
  ThresholdConfig,
  FieldType,
  FieldDef,
  PayloadSchema,
  VarianceSwapIntent,
  FundingSwapIntent,
  ExoticOptionIntent,
  WormholeConfig,
} from "@sigma-protocol/private-intents";

// Re-export types
export * from "./types";

// Re-export utilities
export * from "./utils";

// Import clients for SigmaClient
import { OracleClient } from "./oracle";
import { VolswapClient } from "./volswap";
import { FundingSwapClient } from "./funding-swap";
import { ExoticVaultClient } from "./exotic-vault";
import { SigmaConfig, DEFAULT_CONFIG, PROGRAM_IDS } from "./types";

/**
 * Main client for Sigma Protocol
 *
 * Provides unified access to all Sigma programs:
 * - Oracle: Price feeds, funding rates, variance tracking, SVI, CEX aggregation
 * - Volswap: Variance swaps and volatility trading
 * - FundingSwap: Funding rate derivatives
 * - ExoticVault: Asian and barrier options
 * - PrivateIntents: Encrypted order submission with solver execution
 */
export class SigmaClient {
  public readonly oracle: OracleClient;
  public readonly volswap: VolswapClient;
  public readonly fundingSwap: FundingSwapClient;
  public readonly exoticVault: ExoticVaultClient;

  public readonly provider: AnchorProvider;
  public readonly config: SigmaConfig;

  private _privateIntents: PrivateIntentClient | null = null;

  /**
   * Create a new SigmaClient
   *
   * @param provider - Anchor provider with wallet and connection
   * @param config - Optional configuration
   * @param idls - Optional IDLs for each program (loaded from files in production)
   */
  constructor(
    provider: AnchorProvider,
    config: Partial<SigmaConfig> = {},
    idls?: {
      oracle?: Idl;
      volswap?: Idl;
      fundingSwap?: Idl;
      exoticVault?: Idl;
    }
  ) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize clients
    this.oracle = new OracleClient(provider, idls?.oracle);
    this.volswap = new VolswapClient(provider, idls?.volswap);
    this.fundingSwap = new FundingSwapClient(provider, idls?.fundingSwap);
    this.exoticVault = new ExoticVaultClient(provider, idls?.exoticVault);
  }

  /**
   * Get the connection
   */
  get connection(): Connection {
    return this.provider.connection;
  }

  /**
   * Get the wallet public key
   */
  get walletPublicKey(): PublicKey {
    return this.provider.wallet.publicKey;
  }

  /**
   * Get all program IDs
   */
  get programIds() {
    return PROGRAM_IDS;
  }

  /**
   * Get the private intents client for encrypted order submission
   *
   * Lazily initializes a PrivateIntentClient using the provider's connection
   * and wallet. The client handles encryption, key registration, and intent
   * submission to the private-intents on-chain program.
   *
   * @example
   * ```typescript
   * const client = sigma.privateIntents;
   * client.initializeEncryption(walletSecret);
   * await client.registerWithSolver('https://solver.sigma.fi');
   * await client.submitPrivateVarianceSwap({ ... });
   * ```
   */
  get privateIntents(): PrivateIntentClient {
    if (!this._privateIntents) {
      this._privateIntents = new PrivateIntentClient(
        this.provider.connection,
        this.provider.wallet as Wallet
      );
    }
    return this._privateIntents;
  }

  /**
   * Create a SigmaClient from a connection and wallet
   */
  static fromConnection(
    connection: Connection,
    wallet: any,
    commitment: Commitment = "confirmed",
    config: Partial<SigmaConfig> = {},
    idls?: {
      oracle?: Idl;
      volswap?: Idl;
      fundingSwap?: Idl;
      exoticVault?: Idl;
    }
  ): SigmaClient {
    const provider = new AnchorProvider(
      connection,
      wallet,
      { commitment }
    );
    return new SigmaClient(provider, config, idls);
  }

  /**
   * Create a SigmaClient for devnet
   */
  static devnet(
    wallet: any,
    commitment: Commitment = "confirmed",
    idls?: {
      oracle?: Idl;
      volswap?: Idl;
      fundingSwap?: Idl;
      exoticVault?: Idl;
    }
  ): SigmaClient {
    const connection = new Connection(
      "https://api.devnet.solana.com",
      commitment
    );
    return SigmaClient.fromConnection(
      connection,
      wallet,
      commitment,
      { cluster: "devnet" },
      idls
    );
  }

  /**
   * Create a SigmaClient for mainnet
   */
  static mainnet(
    wallet: any,
    rpcUrl: string = "https://api.mainnet-beta.solana.com",
    commitment: Commitment = "confirmed",
    idls?: {
      oracle?: Idl;
      volswap?: Idl;
      fundingSwap?: Idl;
      exoticVault?: Idl;
    }
  ): SigmaClient {
    const connection = new Connection(rpcUrl, commitment);
    return SigmaClient.fromConnection(
      connection,
      wallet,
      commitment,
      { cluster: "mainnet-beta" },
      idls
    );
  }

  /**
   * Create a SigmaClient for localnet (local validator)
   */
  static localnet(
    wallet: any,
    rpcUrl: string = "http://127.0.0.1:8899",
    commitment: Commitment = "confirmed",
    idls?: {
      oracle?: Idl;
      volswap?: Idl;
      fundingSwap?: Idl;
      exoticVault?: Idl;
    }
  ): SigmaClient {
    const connection = new Connection(rpcUrl, commitment);
    return SigmaClient.fromConnection(
      connection,
      wallet,
      commitment,
      { cluster: "localnet" },
      idls
    );
  }
}

// Default export
export default SigmaClient;
