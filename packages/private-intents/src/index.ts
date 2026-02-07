/**
 * @sigma-protocol/private-intents
 *
 * Private cross-chain intent protocol for Sigma derivatives.
 * Enables encrypted order submission for variance swaps, funding swaps, and exotic options.
 *
 * Uses Solver + Encryption pattern with cross-chain collateral via Wormhole.
 *
 * @example
 * ```typescript
 * import { PrivateIntentClient, IntentType } from '@sigma-protocol/private-intents';
 * import BN from 'bn.js';
 *
 * const client = new PrivateIntentClient(connection, wallet);
 *
 * // Initialize encryption
 * await client.initializeEncryption(walletSecret);
 * await client.registerWithSolver('https://solver.sigma.fi');
 *
 * // Submit private variance swap
 * const intentId = await client.submitPrivateVarianceSwap({
 *   targetPool: poolPubkey,
 *   notional: new BN(1000_000_000), // 1000 USDC
 *   premiumLimit: new BN(50_000_000),
 *   strikeVarianceBps: new BN(5000),
 *   deadline: Math.floor(Date.now() / 1000) + 3600,
 *   slippageBps: 100,
 *   isLong: true,
 * });
 * ```
 */

// Encryption primitives (re-exported from @privacy-suite/crypto)
export * from './encryption';

// Payload schemas
export * from './schemas';

// Client (to be implemented)
export { PrivateIntentClient } from './client/private-intent-client';
export { CrossChainClient, CollateralSource } from './client/cross-chain-client';

// Cross-chain (to be implemented)
export { WormholeClient, WormholeConfig } from './cross-chain/wormhole';

// Constants and types
export const PRIVATE_INTENTS_PROGRAM_ID = 'AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow';

export const SEEDS = {
  SOLVER_CONFIG: Buffer.from('solver_config'),
  ENCRYPTED_INTENT: Buffer.from('encrypted_intent'),
  INTENT_VAULT: Buffer.from('intent_vault'),
} as const;

/**
 * Intent status on-chain
 */
export enum IntentStatus {
  Pending = 0,
  Executing = 1,
  Completed = 2,
  Cancelled = 3,
  Failed = 4,
  BridgePending = 5,
}

/**
 * Get human-readable intent status name
 */
export function getIntentStatusName(status: IntentStatus): string {
  const names: Record<IntentStatus, string> = {
    [IntentStatus.Pending]: 'Pending',
    [IntentStatus.Executing]: 'Executing',
    [IntentStatus.Completed]: 'Completed',
    [IntentStatus.Cancelled]: 'Cancelled',
    [IntentStatus.Failed]: 'Failed',
    [IntentStatus.BridgePending]: 'Bridge Pending',
  };
  return names[status] || 'Unknown';
}
