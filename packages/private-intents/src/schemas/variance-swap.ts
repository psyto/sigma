import { PayloadSchema, serializePayload, deserializePayload } from '@privacy-suite/crypto';
import BN from 'bn.js';

/**
 * Variance Swap Intent Payload
 *
 * Encodes the private parameters for a variance swap order:
 * - notional: Position size in collateral tokens
 * - premiumLimit: Max premium (long) or min premium (short) to accept
 * - strikeVarianceBps: Strike variance in basis points (e.g., 5000 = 50% vol^2)
 * - deadline: Unix timestamp after which order expires
 * - slippageBps: Maximum slippage tolerance
 * - isLong: 1 = long variance, 0 = short variance
 */
export interface VarianceSwapIntent {
  notional: BN;
  premiumLimit: BN;
  strikeVarianceBps: BN;
  deadline: number;
  slippageBps: number;
  isLong: boolean;
}

/**
 * Schema for variance swap intent payload (40 bytes)
 * When encrypted with NaCl box, becomes ~80 bytes (nonce + ciphertext + overhead)
 */
export const VARIANCE_SWAP_SCHEMA: PayloadSchema = {
  fields: [
    { name: 'notional', type: 'u64' },           // 8 bytes
    { name: 'premiumLimit', type: 'u64' },       // 8 bytes
    { name: 'strikeVarianceBps', type: 'u64' },  // 8 bytes
    { name: 'deadline', type: 'i64' },           // 8 bytes
    { name: 'slippageBps', type: 'u16' },        // 2 bytes
    { name: 'isLong', type: 'u8' },              // 1 byte
    { name: 'padding', type: 'bytes', size: 5 }, // 5 bytes (alignment)
  ],
};

/**
 * Serialize a variance swap intent to bytes
 */
export function serializeVarianceSwapIntent(intent: VarianceSwapIntent): Uint8Array {
  return serializePayload(
    {
      notional: intent.notional,
      premiumLimit: intent.premiumLimit,
      strikeVarianceBps: intent.strikeVarianceBps,
      deadline: intent.deadline,
      slippageBps: intent.slippageBps,
      isLong: intent.isLong ? 1 : 0,
      padding: new Uint8Array(5),
    },
    VARIANCE_SWAP_SCHEMA
  );
}

/**
 * Deserialize bytes to a variance swap intent
 */
export function deserializeVarianceSwapIntent(bytes: Uint8Array): VarianceSwapIntent {
  const data = deserializePayload(bytes, VARIANCE_SWAP_SCHEMA);
  return {
    notional: data.notional as BN,
    premiumLimit: data.premiumLimit as BN,
    strikeVarianceBps: data.strikeVarianceBps as BN,
    deadline: data.deadline as number,
    slippageBps: data.slippageBps as number,
    isLong: data.isLong === 1,
  };
}

/**
 * Validate variance swap intent parameters
 */
export function validateVarianceSwapIntent(intent: VarianceSwapIntent): void {
  if (intent.notional.lte(new BN(0))) {
    throw new Error('Notional must be positive');
  }
  if (intent.premiumLimit.lt(new BN(0))) {
    throw new Error('Premium limit cannot be negative');
  }
  if (intent.strikeVarianceBps.lte(new BN(0))) {
    throw new Error('Strike variance must be positive');
  }
  if (intent.deadline <= Date.now() / 1000) {
    throw new Error('Deadline must be in the future');
  }
  if (intent.slippageBps > 10000) {
    throw new Error('Slippage cannot exceed 100%');
  }
}
