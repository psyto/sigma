import { PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN, Program, Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { FundingSwapIntent } from '@sigma-protocol/private-intents';
import {
  PROGRAM_IDS,
  findFundingPoolPDA,
  findFundingPoolVaultPDA,
  findFundingSwapPositionPDA,
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
 * Executor for funding swap intents
 *
 * Handles opening receive-fixed/pay-fixed funding rate positions
 * via the FundingSwap program
 */
export class FundingExecutor {
  private provider: AnchorProvider;
  private program: Program;

  constructor(provider: AnchorProvider, idl?: Idl) {
    this.provider = provider;
    this.program = new Program(idl, provider);
  }

  /**
   * Execute a funding swap intent
   *
   * @param intent - The encrypted intent data from on-chain
   * @param params - The decrypted funding swap parameters
   * @param solverWallet - The solver's wallet for signing
   */
  async execute(
    intent: IntentData,
    params: FundingSwapIntent,
    solverWallet: Wallet
  ): Promise<ExecutorResult> {
    console.log(`Executing funding swap intent ${intent.intentId.toString()}`);
    console.log(`  Pool: ${intent.targetPool.toBase58()}`);
    console.log(`  Notional: ${params.notional.toString()}`);
    console.log(`  Duration: ${params.durationPeriods} periods`);
    console.log(`  Fixed Rate Limit: ${params.fixedRateLimitBps} bps`);
    console.log(`  Is Receiver (receive fixed): ${params.isReceiver}`);
    console.log(`  Slippage: ${params.slippageBps} bps`);

    // Fetch pool state to get next swap ID
    const poolData = await (this.program.account as any).fundingPool.fetch(
      intent.targetPool
    );
    if (!poolData) {
      throw new Error(`Pool not found: ${intent.targetPool.toBase58()}`);
    }

    // Validate the swap before executing
    const validation = await this.validateSwap(
      intent.targetPool,
      poolData,
      params.notional,
      params.durationPeriods,
      params.fixedRateLimitBps,
      params.isReceiver
    );
    if (!validation.valid) {
      throw new Error(`Swap validation failed: ${validation.reason}`);
    }

    // Derive a swap ID from the pool's total swap count
    const swapId: BN = poolData.totalSwaps || new BN(0);

    // Derive PDAs
    const [poolVault] = findFundingPoolVaultPDA(intent.targetPool);
    const [swapPda] = findFundingSwapPositionPDA(
      intent.targetPool,
      solverWallet.publicKey,
      swapId
    );

    // Get solver's collateral token account
    const userCollateral = getAssociatedTokenAddressSync(
      intent.collateralMint,
      solverWallet.publicKey
    );

    const fixedRateBps = new BN(params.fixedRateLimitBps);

    // Build and send the appropriate instruction
    let signature: string;

    if (params.isReceiver) {
      signature = await this.program.methods
        .openReceiveFixed(params.notional, fixedRateBps, swapId)
        .accounts({
          user: solverWallet.publicKey,
          pool: intent.targetPool,
          position: swapPda,
          userCollateral,
          poolVault,
          collateralMint: intent.collateralMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } else {
      signature = await this.program.methods
        .openPayFixed(params.notional, fixedRateBps, swapId)
        .accounts({
          user: solverWallet.publicKey,
          pool: intent.targetPool,
          position: swapPda,
          userCollateral,
          poolVault,
          collateralMint: intent.collateralMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    console.log(`  Swap PDA: ${swapPda.toBase58()}`);
    console.log(`  Signature: ${signature}`);

    return {
      positionPubkey: swapPda,
      signature,
    };
  }

  /**
   * Get current implied fixed rate for a pool
   */
  async getCurrentFixedRate(poolPubkey: PublicKey): Promise<number> {
    const poolData = await (this.program.account as any).fundingPool.fetch(poolPubkey);
    if (!poolData) return 0;

    // Implied rate based on outstanding notional imbalance
    const receiveFixed = poolData.totalReceiveFixedNotional || new BN(0);
    const payFixed = poolData.totalPayFixedNotional || new BN(0);
    const total = receiveFixed.add(payFixed);

    if (total.isZero()) return 0;

    // Rate adjusts based on supply/demand imbalance
    const imbalanceRatio = receiveFixed.sub(payFixed).toNumber() / total.toNumber();
    const baseRate = poolData.feeRateBps || 0;
    return baseRate + Math.round(imbalanceRatio * 100);
  }

  /**
   * Check if the funding swap parameters are valid
   */
  async validateSwap(
    poolPubkey: PublicKey,
    poolData: any,
    notional: BN,
    durationPeriods: number,
    fixedRateLimitBps: number,
    isReceiver: boolean
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

    if (durationPeriods <= 0) {
      return { valid: false, reason: 'Duration must be positive' };
    }

    // Check current rate against limit
    const currentRate = await this.getCurrentFixedRate(poolPubkey);
    if (isReceiver && currentRate < fixedRateLimitBps) {
      return { valid: false, reason: `Current rate ${currentRate} bps below limit ${fixedRateLimitBps} bps` };
    }
    if (!isReceiver && currentRate > fixedRateLimitBps) {
      return { valid: false, reason: `Current rate ${currentRate} bps exceeds limit ${fixedRateLimitBps} bps` };
    }

    return { valid: true };
  }
}
