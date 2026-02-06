import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  PROGRAM_IDS,
  ExoticVault,
  ExoticOption,
  LiquidityProvider,
  PriceSampleBuffer,
} from "./types";
import {
  findExoticVaultPDA,
  findVaultCollateralPDA,
  findExoticOptionPDA,
  findOptionSampleBufferPDA,
  findExoticVaultLpAccountPDA,
  findPriceFeedPDA,
} from "./utils";

export interface VaultParams {
  minNotional: BN;
  maxNotional: BN;
  minDurationDays: number;
  maxDurationDays: number;
  feeRateBps: number;
  sampleIntervalSeconds: BN;
}

/**
 * Client for interacting with the Sigma ExoticVault program
 */
export class ExoticVaultClient {
  private program: Program;
  private provider: AnchorProvider;

  constructor(provider: AnchorProvider, idl?: any) {
    this.provider = provider;
    this.program = new Program(idl, provider);
  }

  get connection(): Connection {
    return this.provider.connection;
  }

  get programId(): PublicKey {
    return PROGRAM_IDS.EXOTIC_VAULT;
  }

  // ============================================================================
  // Vault Methods
  // ============================================================================

  /**
   * Initialize a new exotic options vault
   */
  async initializeVault(
    collateralMint: PublicKey,
    underlyingMint: PublicKey,
    params: VaultParams
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [vaultCollateral] = findVaultCollateralPDA(vault);
    const [priceFeed] = findPriceFeedPDA(underlyingMint);

    return this.program.methods
      .initializeVault(params)
      .accounts({
        authority: this.provider.wallet.publicKey,
        collateralMint,
        underlyingMint,
        priceFeed,
        vault,
        vaultCollateral,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Update vault parameters
   */
  async updateVault(
    underlyingMint: PublicKey,
    feeRateBps: number | null,
    isActive: boolean | null
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);

    return this.program.methods
      .updateVault(feeRateBps, isActive)
      .accounts({
        authority: this.provider.wallet.publicKey,
        vault,
      })
      .rpc();
  }

  /**
   * Fetch a vault account
   */
  async getVault(underlyingMint: PublicKey): Promise<ExoticVault | null> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    try {
      return await (this.program.account as any).exoticVault.fetch(vault) as unknown as ExoticVault;
    } catch {
      return null;
    }
  }

  /**
   * Get vault address
   */
  getVaultAddress(underlyingMint: PublicKey): PublicKey {
    return findExoticVaultPDA(underlyingMint)[0];
  }

  // ============================================================================
  // Asian Option Methods
  // ============================================================================

  /**
   * Buy an Asian call option (TWAP-settled)
   */
  async buyAsianCall(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    strikePrice: BN,
    notional: BN,
    durationDays: number
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [vaultCollateral] = findVaultCollateralPDA(vault);
    const vaultData = await this.getVault(underlyingMint);
    if (!vaultData) throw new Error("Vault not found");

    const [option] = findExoticOptionPDA(
      vault,
      this.provider.wallet.publicKey,
      vaultData.totalOptions
    );
    const [sampleBuffer] = findOptionSampleBufferPDA(option);

    return this.program.methods
      .buyAsianCall(strikePrice, notional, durationDays)
      .accounts({
        user: this.provider.wallet.publicKey,
        vault,
        option,
        sampleBuffer,
        userCollateral,
        vaultCollateral,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Buy an Asian put option (TWAP-settled)
   */
  async buyAsianPut(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    strikePrice: BN,
    notional: BN,
    durationDays: number
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [vaultCollateral] = findVaultCollateralPDA(vault);
    const vaultData = await this.getVault(underlyingMint);
    if (!vaultData) throw new Error("Vault not found");

    const [option] = findExoticOptionPDA(
      vault,
      this.provider.wallet.publicKey,
      vaultData.totalOptions
    );
    const [sampleBuffer] = findOptionSampleBufferPDA(option);

    return this.program.methods
      .buyAsianPut(strikePrice, notional, durationDays)
      .accounts({
        user: this.provider.wallet.publicKey,
        vault,
        option,
        sampleBuffer,
        userCollateral,
        vaultCollateral,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Record a price sample for an Asian option
   */
  async recordPriceSample(
    underlyingMint: PublicKey,
    optionOwner: PublicKey,
    optionIndex: BN
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [priceFeed] = findPriceFeedPDA(underlyingMint);
    const [option] = findExoticOptionPDA(vault, optionOwner, optionIndex);
    const [sampleBuffer] = findOptionSampleBufferPDA(option);

    return this.program.methods
      .recordPriceSample()
      .accounts({
        oracle: this.provider.wallet.publicKey,
        vault,
        option,
        sampleBuffer,
        priceFeed,
      })
      .rpc();
  }

  // ============================================================================
  // Barrier Option Methods
  // ============================================================================

  /**
   * Buy a knock-out barrier option
   */
  async buyKnockout(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    strikePrice: BN,
    barrierPrice: BN,
    notional: BN,
    durationDays: number,
    isCall: boolean,
    isUpBarrier: boolean
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [vaultCollateral] = findVaultCollateralPDA(vault);
    const vaultData = await this.getVault(underlyingMint);
    if (!vaultData) throw new Error("Vault not found");

    const [option] = findExoticOptionPDA(
      vault,
      this.provider.wallet.publicKey,
      vaultData.totalOptions
    );

    return this.program.methods
      .buyKnockout(strikePrice, barrierPrice, notional, durationDays, isCall, isUpBarrier)
      .accounts({
        user: this.provider.wallet.publicKey,
        vault,
        option,
        userCollateral,
        vaultCollateral,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Buy a knock-in barrier option
   */
  async buyKnockin(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    strikePrice: BN,
    barrierPrice: BN,
    notional: BN,
    durationDays: number,
    isCall: boolean,
    isUpBarrier: boolean
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [vaultCollateral] = findVaultCollateralPDA(vault);
    const vaultData = await this.getVault(underlyingMint);
    if (!vaultData) throw new Error("Vault not found");

    const [option] = findExoticOptionPDA(
      vault,
      this.provider.wallet.publicKey,
      vaultData.totalOptions
    );

    return this.program.methods
      .buyKnockin(strikePrice, barrierPrice, notional, durationDays, isCall, isUpBarrier)
      .accounts({
        user: this.provider.wallet.publicKey,
        vault,
        option,
        userCollateral,
        vaultCollateral,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Check if a barrier has been breached
   */
  async checkBarrier(
    underlyingMint: PublicKey,
    optionOwner: PublicKey,
    optionIndex: BN
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [priceFeed] = findPriceFeedPDA(underlyingMint);
    const [option] = findExoticOptionPDA(vault, optionOwner, optionIndex);

    return this.program.methods
      .checkBarrier()
      .accounts({
        keeper: this.provider.wallet.publicKey,
        vault,
        option,
        priceFeed,
      })
      .rpc();
  }

  // ============================================================================
  // Settlement Methods
  // ============================================================================

  /**
   * Settle an option at expiry
   */
  async settleOption(
    underlyingMint: PublicKey,
    optionIndex: BN
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [priceFeed] = findPriceFeedPDA(underlyingMint);
    const [option] = findExoticOptionPDA(
      vault,
      this.provider.wallet.publicKey,
      optionIndex
    );
    const [sampleBuffer] = findOptionSampleBufferPDA(option);

    return this.program.methods
      .settleOption()
      .accounts({
        user: this.provider.wallet.publicKey,
        vault,
        option,
        sampleBuffer,
        priceFeed,
      })
      .rpc();
  }

  /**
   * Claim payout after option settlement
   */
  async claimPayout(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    optionIndex: BN
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [vaultCollateral] = findVaultCollateralPDA(vault);
    const [option] = findExoticOptionPDA(
      vault,
      this.provider.wallet.publicKey,
      optionIndex
    );

    return this.program.methods
      .claimPayout()
      .accounts({
        user: this.provider.wallet.publicKey,
        vault,
        option,
        vaultCollateral,
        userCollateral,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Fetch an option account
   */
  async getOption(
    underlyingMint: PublicKey,
    owner: PublicKey,
    optionIndex: BN
  ): Promise<ExoticOption | null> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [option] = findExoticOptionPDA(vault, owner, optionIndex);
    try {
      return await (this.program.account as any).exoticOption.fetch(option) as unknown as ExoticOption;
    } catch {
      return null;
    }
  }

  /**
   * Fetch sample buffer for an Asian option
   */
  async getSampleBuffer(
    underlyingMint: PublicKey,
    owner: PublicKey,
    optionIndex: BN
  ): Promise<PriceSampleBuffer | null> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [option] = findExoticOptionPDA(vault, owner, optionIndex);
    const [sampleBuffer] = findOptionSampleBufferPDA(option);
    try {
      return await (this.program.account as any).priceSampleBuffer.fetch(sampleBuffer) as unknown as PriceSampleBuffer;
    } catch {
      return null;
    }
  }

  /**
   * Get all options for a user
   */
  async getUserOptions(
    underlyingMint: PublicKey,
    user: PublicKey
  ): Promise<ExoticOption[]> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const accounts = await (this.program.account as any).exoticOption.all([
      {
        memcmp: {
          offset: 8, // After discriminator
          bytes: user.toBase58(),
        },
      },
      {
        memcmp: {
          offset: 8 + 32, // After discriminator + owner
          bytes: vault.toBase58(),
        },
      },
    ]);
    return accounts.map((a: any) => a.account as ExoticOption);
  }

  // ============================================================================
  // Liquidity Methods
  // ============================================================================

  /**
   * Deposit liquidity to the vault
   */
  async depositLiquidity(
    underlyingMint: PublicKey,
    userCollateral: PublicKey,
    amount: BN
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [vaultCollateral] = findVaultCollateralPDA(vault);
    const [lpAccount] = findExoticVaultLpAccountPDA(
      vault,
      this.provider.wallet.publicKey
    );

    return this.program.methods
      .depositLiquidity(amount)
      .accounts({
        user: this.provider.wallet.publicKey,
        vault,
        lpAccount,
        userCollateral,
        vaultCollateral,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Withdraw liquidity from the vault
   */
  async withdrawLiquidity(
    underlyingMint: PublicKey,
    collateralMint: PublicKey,
    userCollateral: PublicKey,
    shares: BN
  ): Promise<string> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [vaultCollateral] = findVaultCollateralPDA(vault);
    const [lpAccount] = findExoticVaultLpAccountPDA(
      vault,
      this.provider.wallet.publicKey
    );

    return this.program.methods
      .withdrawLiquidity(shares)
      .accounts({
        user: this.provider.wallet.publicKey,
        vault,
        lpAccount,
        userCollateral,
        vaultCollateral,
        collateralMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Fetch an LP account
   */
  async getLpAccount(
    underlyingMint: PublicKey,
    user: PublicKey
  ): Promise<LiquidityProvider | null> {
    const [vault] = findExoticVaultPDA(underlyingMint);
    const [lpAccount] = findExoticVaultLpAccountPDA(vault, user);
    try {
      return await (this.program.account as any).liquidityProvider.fetch(lpAccount) as unknown as LiquidityProvider;
    } catch {
      return null;
    }
  }
}
