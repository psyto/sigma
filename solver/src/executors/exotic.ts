import { PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN, Program } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  ExoticOptionIntent,
  ExoticOptionType,
  getOptionTypeName,
} from '@sigma-protocol/private-intents';
import {
  PROGRAM_IDS,
  findExoticVaultPDA,
  findVaultCollateralPDA,
  findExoticOptionPDA,
  findOptionSampleBufferPDA,
} from '@sigma-protocol/sdk';
import { IntentData } from '../solver';

/**
 * Execution result from the executor
 */
export interface ExecutorResult {
  positionPubkey: PublicKey;
  signature: string;
}

/**
 * Executor for exotic option intents
 *
 * Handles opening Asian options and barrier options
 * via the ExoticVault program
 */
export class ExoticExecutor {
  private provider: AnchorProvider;
  private program: Program;

  constructor(provider: AnchorProvider, idl?: any) {
    this.provider = provider;
    this.program = new Program(idl, provider);
  }

  /**
   * Execute an exotic option intent
   *
   * @param intent - The encrypted intent data from on-chain
   * @param params - The decrypted exotic option parameters
   * @param solverWallet - The solver's wallet for signing
   */
  async execute(
    intent: IntentData,
    params: ExoticOptionIntent,
    solverWallet: Wallet
  ): Promise<ExecutorResult> {
    console.log(`Executing exotic option intent ${intent.intentId.toString()}`);
    console.log(`  Vault: ${intent.targetPool.toBase58()}`);
    console.log(`  Option Type: ${getOptionTypeName(params.optionType)}`);
    console.log(`  Notional: ${params.notional.toString()}`);
    console.log(`  Strike: ${params.strikePrice.toString()}`);
    console.log(`  Barrier: ${params.barrierPrice.toString()}`);
    console.log(`  Duration: ${params.durationDays} days`);
    console.log(`  Slippage: ${params.slippageBps} bps`);

    // Fetch vault state to get next option index
    const vaultData = await (this.program.account as any).exoticVault.fetch(
      intent.targetPool
    );
    if (!vaultData) {
      throw new Error(`Vault not found: ${intent.targetPool.toBase58()}`);
    }

    // Validate the option parameters
    const validation = await this.validateOption(
      intent.targetPool,
      vaultData,
      params
    );
    if (!validation.valid) {
      throw new Error(`Option validation failed: ${validation.reason}`);
    }

    const optionIndex: BN = vaultData.totalOptions;

    // Derive PDAs
    const [vaultCollateral] = findVaultCollateralPDA(intent.targetPool);
    const [optionPda] = findExoticOptionPDA(
      intent.targetPool,
      solverWallet.publicKey,
      optionIndex
    );

    // Get solver's collateral token account
    const userCollateral = getAssociatedTokenAddressSync(
      intent.collateralMint,
      solverWallet.publicKey
    );

    // Determine instruction based on option type
    const isAsianOption =
      params.optionType === ExoticOptionType.AsianCall ||
      params.optionType === ExoticOptionType.AsianPut;

    let signature: string;

    if (isAsianOption) {
      // Asian options need a sample buffer for TWAP tracking
      const [sampleBuffer] = findOptionSampleBufferPDA(optionPda);

      if (params.optionType === ExoticOptionType.AsianCall) {
        signature = await this.program.methods
          .buyAsianCall(params.strikePrice, params.notional, params.durationDays)
          .accounts({
            user: solverWallet.publicKey,
            vault: intent.targetPool,
            option: optionPda,
            sampleBuffer,
            userCollateral,
            vaultCollateral,
            collateralMint: intent.collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } else {
        signature = await this.program.methods
          .buyAsianPut(params.strikePrice, params.notional, params.durationDays)
          .accounts({
            user: solverWallet.publicKey,
            vault: intent.targetPool,
            option: optionPda,
            sampleBuffer,
            userCollateral,
            vaultCollateral,
            collateralMint: intent.collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
    } else {
      // Barrier options (knockout and knockin)
      const { isCall, isUpBarrier } = this.parseBarrierType(params.optionType);
      const isKnockout = this.isKnockoutType(params.optionType);

      if (isKnockout) {
        signature = await this.program.methods
          .buyKnockout(
            params.strikePrice,
            params.barrierPrice,
            params.notional,
            params.durationDays,
            isCall,
            isUpBarrier
          )
          .accounts({
            user: solverWallet.publicKey,
            vault: intent.targetPool,
            option: optionPda,
            userCollateral,
            vaultCollateral,
            collateralMint: intent.collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } else {
        signature = await this.program.methods
          .buyKnockin(
            params.strikePrice,
            params.barrierPrice,
            params.notional,
            params.durationDays,
            isCall,
            isUpBarrier
          )
          .accounts({
            user: solverWallet.publicKey,
            vault: intent.targetPool,
            option: optionPda,
            userCollateral,
            vaultCollateral,
            collateralMint: intent.collateralMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
    }

    console.log(`  Option PDA: ${optionPda.toBase58()}`);
    console.log(`  Signature: ${signature}`);

    return {
      positionPubkey: optionPda,
      signature,
    };
  }

  /**
   * Parse barrier option type into call/put and up/down components
   */
  private parseBarrierType(optionType: ExoticOptionType): {
    isCall: boolean;
    isUpBarrier: boolean;
  } {
    switch (optionType) {
      case ExoticOptionType.UpAndOutCall:
      case ExoticOptionType.UpAndInCall:
        return { isCall: true, isUpBarrier: true };
      case ExoticOptionType.DownAndOutCall:
      case ExoticOptionType.DownAndInCall:
        return { isCall: true, isUpBarrier: false };
      case ExoticOptionType.UpAndOutPut:
      case ExoticOptionType.UpAndInPut:
        return { isCall: false, isUpBarrier: true };
      case ExoticOptionType.DownAndOutPut:
      case ExoticOptionType.DownAndInPut:
        return { isCall: false, isUpBarrier: false };
      default:
        return { isCall: true, isUpBarrier: true };
    }
  }

  /**
   * Check if the option type is a knockout (vs knockin)
   */
  private isKnockoutType(optionType: ExoticOptionType): boolean {
    return (
      optionType === ExoticOptionType.UpAndOutCall ||
      optionType === ExoticOptionType.UpAndOutPut ||
      optionType === ExoticOptionType.DownAndOutCall ||
      optionType === ExoticOptionType.DownAndOutPut
    );
  }

  /**
   * Calculate premium for an exotic option
   */
  async calculatePremium(
    vaultPubkey: PublicKey,
    optionType: ExoticOptionType,
    notional: BN,
    strikePrice: BN,
    barrierPrice: BN,
    durationDays: number
  ): Promise<BN> {
    const vaultData = await (this.program.account as any).exoticVault.fetch(vaultPubkey);
    if (!vaultData) return new BN(0);

    // Base premium = notional * feeRateBps / 10000
    const feeRate = new BN(vaultData.feeRateBps);
    let premium = notional.mul(feeRate).div(new BN(10000));

    // Duration multiplier: longer options cost more
    const durationMultiplier = new BN(Math.ceil(Math.sqrt(durationDays) * 100));
    premium = premium.mul(durationMultiplier).div(new BN(100));

    // Barrier options are cheaper than vanilla (barrier discount)
    const isBarrier =
      optionType !== ExoticOptionType.AsianCall &&
      optionType !== ExoticOptionType.AsianPut;
    if (isBarrier) {
      premium = premium.mul(new BN(70)).div(new BN(100)); // 30% discount
    }

    return premium;
  }

  /**
   * Check if the exotic option parameters are valid
   */
  async validateOption(
    vaultPubkey: PublicKey,
    vaultData: any,
    params: ExoticOptionIntent
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!vaultData.isActive) {
      return { valid: false, reason: 'Vault is not active' };
    }

    if (params.notional.lt(vaultData.minNotional)) {
      return { valid: false, reason: `Notional ${params.notional.toString()} below minimum ${vaultData.minNotional.toString()}` };
    }

    if (params.notional.gt(vaultData.maxNotional)) {
      return { valid: false, reason: `Notional ${params.notional.toString()} exceeds maximum ${vaultData.maxNotional.toString()}` };
    }

    if (params.durationDays < (vaultData.minDurationDays || 1)) {
      return { valid: false, reason: `Duration ${params.durationDays} days below minimum` };
    }

    if (params.durationDays > (vaultData.maxDurationDays || 365)) {
      return { valid: false, reason: `Duration ${params.durationDays} days exceeds maximum` };
    }

    if (params.strikePrice.isZero()) {
      return { valid: false, reason: 'Strike price must be positive' };
    }

    // For barrier options, validate barrier price
    const isBarrier =
      params.optionType !== ExoticOptionType.AsianCall &&
      params.optionType !== ExoticOptionType.AsianPut;
    if (isBarrier && params.barrierPrice.isZero()) {
      return { valid: false, reason: 'Barrier price must be positive for barrier options' };
    }

    return { valid: true };
  }

  /**
   * Check if a barrier option has been breached
   */
  async checkBarrierStatus(
    optionPubkey: PublicKey
  ): Promise<{ breached: boolean; breachPrice?: BN; breachTime?: number }> {
    try {
      const optionData = await (this.program.account as any).exoticOption.fetch(optionPubkey);
      if (!optionData) return { breached: false };

      return {
        breached: optionData.barrierBreached || false,
        breachPrice: optionData.barrierBreachPrice || undefined,
        breachTime: optionData.barrierBreachTime?.toNumber() || undefined,
      };
    } catch {
      return { breached: false };
    }
  }
}
