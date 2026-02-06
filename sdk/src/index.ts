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
 * ```
 */

import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, Commitment, PublicKey } from "@solana/web3.js";

// Re-export clients
export { OracleClient } from "./oracle";
export { VolswapClient, type PoolParams } from "./volswap";
export { FundingSwapClient, type FundingPoolParams } from "./funding-swap";
export { ExoticVaultClient, type VaultParams } from "./exotic-vault";

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
 */
export class SigmaClient {
  public readonly oracle: OracleClient;
  public readonly volswap: VolswapClient;
  public readonly fundingSwap: FundingSwapClient;
  public readonly exoticVault: ExoticVaultClient;

  public readonly provider: AnchorProvider;
  public readonly config: SigmaConfig;

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
      oracle?: any;
      volswap?: any;
      fundingSwap?: any;
      exoticVault?: any;
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
   * Create a SigmaClient from a connection and wallet
   */
  static fromConnection(
    connection: Connection,
    wallet: any,
    commitment: Commitment = "confirmed",
    config: Partial<SigmaConfig> = {},
    idls?: {
      oracle?: any;
      volswap?: any;
      fundingSwap?: any;
      exoticVault?: any;
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
      oracle?: any;
      volswap?: any;
      fundingSwap?: any;
      exoticVault?: any;
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
      oracle?: any;
      volswap?: any;
      fundingSwap?: any;
      exoticVault?: any;
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
      oracle?: any;
      volswap?: any;
      fundingSwap?: any;
      exoticVault?: any;
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
