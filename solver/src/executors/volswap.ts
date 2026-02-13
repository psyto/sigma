import { PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN, Program, Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { VarianceSwapIntent } from '@sigma-protocol/private-intents';
import {
  PROGRAM_IDS,
  findVariancePoolPDA,
  findPoolVaultPDA,
  findVariancePositionPDA,
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
 * Executor for variance swap intents
 *
 * Handles opening long/short variance positions via the VolSwap program
 */
export class VolswapExecutor {
  private provider: AnchorProvider;
  private program: Program;

  constructor(provider: AnchorProvider, idl?: Idl) {
    this.provider = provider;
    this.program = new Program(idl, provider);
  }

  /**
   * Execute a variance swap intent
   *
   * @param intent - The encrypted intent data from on-chain
   * @param params - The decrypted variance swap parameters
   * @param solverWallet - The solver's wallet for signing
   */
  async execute(
    intent: IntentData,
    params: VarianceSwapIntent,
    solverWallet: Wallet
  ): Promise<ExecutorResult> {
    console.log(`Executing variance swap intent ${intent.intentId.toString()}`);
    console.log(`  Pool: ${intent.targetPool.toBase58()}`);
    console.log(`  Notional: ${params.notional.toString()}`);
    console.log(`  Strike Variance: ${params.strikeVarianceBps.toString()} bps`);
    console.log(`  Is Long: ${params.isLong}`);
    console.log(`  Premium Limit: ${params.premiumLimit.toString()}`);
    console.log(`  Slippage: ${params.slippageBps} bps`);

    // Fetch pool state to get current epoch
    const poolData = await (this.program.account as any).variancePool.fetch(
      intent.targetPool
    );
    if (!poolData) {
      throw new Error(`Pool not found: ${intent.targetPool.toBase58()}`);
    }

    const currentEpoch: BN = poolData.currentEpoch;

    // Validate the position before executing
    const validation = await this.validatePosition(
      intent.targetPool,
      poolData,
      params.notional,
      params.premiumLimit,
      params.isLong
    );
    if (!validation.valid) {
      throw new Error(`Position validation failed: ${validation.reason}`);
    }

    // Derive PDAs
    const [poolVault] = findPoolVaultPDA(intent.targetPool);
    const [positionPda] = findVariancePositionPDA(
      intent.targetPool,
      solverWallet.publicKey,
      currentEpoch
    );

    // Get solver's collateral token account
    const userCollateral = getAssociatedTokenAddressSync(
      intent.collateralMint,
      solverWallet.publicKey
    );

    // Build and send the appropriate instruction
    let signature: string;

    if (params.isLong) {
      signature = await this.program.methods
        .openLong(params.notional, params.premiumLimit)
        .accounts({
          user: solverWallet.publicKey,
          pool: intent.targetPool,
          position: positionPda,
          userCollateral,
          poolVault,
          collateralMint: intent.collateralMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } else {
      signature = await this.program.methods
        .openShort(params.notional, params.premiumLimit)
        .accounts({
          user: solverWallet.publicKey,
          pool: intent.targetPool,
          position: positionPda,
          userCollateral,
          poolVault,
          collateralMint: intent.collateralMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    console.log(`  Position PDA: ${positionPda.toBase58()}`);
    console.log(`  Signature: ${signature}`);

    return {
      positionPubkey: positionPda,
      signature,
    };
  }

  /**
   * Calculate expected premium for a variance position
   */
  async calculatePremium(
    poolPubkey: PublicKey,
    notional: BN,
    isLong: boolean
  ): Promise<BN> {
    const poolData = await (this.program.account as any).variancePool.fetch(poolPubkey);
    if (!poolData) return new BN(0);

    // Premium = notional * feeRateBps / 10000
    const feeRate = new BN(poolData.feeRateBps);
    const premium = notional.mul(feeRate).div(new BN(10000));
    return premium;
  }

  /**
   * Check if the pool can accept the position
   */
  async validatePosition(
    poolPubkey: PublicKey,
    poolData: any,
    notional: BN,
    premiumLimit: BN,
    isLong: boolean
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!poolData.isActive) {
      return { valid: false, reason: 'Pool is not active' };
    }

    if (notional.lt(poolData.minNotional)) {
      return { valid: false, reason: `Notional ${notional.toString()} below minimum ${poolData.minNotional.toString()}` };
    }

    if (notional.gt(poolData.maxNotional)) {
      return { valid: false, reason: `Notional ${notional.toString()} exceeds maximum ${poolData.maxNotional.toString()}` };
    }

    // Calculate premium and check against limit
    const premium = await this.calculatePremium(poolPubkey, notional, isLong);
    if (isLong && premium.gt(premiumLimit)) {
      return { valid: false, reason: `Premium ${premium.toString()} exceeds limit ${premiumLimit.toString()}` };
    }
    if (!isLong && premium.lt(premiumLimit)) {
      return { valid: false, reason: `Premium ${premium.toString()} below minimum ${premiumLimit.toString()}` };
    }

    return { valid: true };
  }
}
