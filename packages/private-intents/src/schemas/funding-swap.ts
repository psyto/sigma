import { PayloadSchema, serializePayload, deserializePayload } from '@veil/crypto';
import BN from 'bn.js';

/**
 * Funding Swap Intent Payload
 *
 * Encodes the private parameters for a funding rate swap:
 * - notional: Position size in collateral tokens
 * - durationPeriods: Number of funding periods (e.g., 8-hour intervals)
 * - fixedRateLimitBps: Max/min fixed rate to accept (signed, in bps)
 * - deadline: Unix timestamp after which order expires
 * - slippageBps: Maximum slippage tolerance
 * - isReceiver: 1 = receive fixed rate, 0 = pay fixed rate
 */
export interface FundingSwapIntent {
  notional: BN;
  durationPeriods: number;
  fixedRateLimitBps: number;
  deadline: number;
  slippageBps: number;
  isReceiver: boolean;
}

/**
 * Schema for funding swap intent payload (26 bytes)
 * When encrypted with NaCl box, becomes ~66 bytes
 */
export const FUNDING_SWAP_SCHEMA: PayloadSchema = {
  fields: [
    { name: 'notional', type: 'u64' },              // 8 bytes
    { name: 'durationPeriods', type: 'u16' },       // 2 bytes
    { name: 'fixedRateLimitBps', type: 'u16' },     // 2 bytes (treated as i16)
    { name: 'deadline', type: 'i64' },              // 8 bytes
    { name: 'slippageBps', type: 'u16' },           // 2 bytes
    { name: 'isReceiver', type: 'u8' },             // 1 byte
    { name: 'padding', type: 'bytes', size: 3 },    // 3 bytes (alignment)
  ],
};

/**
 * Serialize a funding swap intent to bytes
 */
export function serializeFundingSwapIntent(intent: FundingSwapIntent): Uint8Array {
  // Convert signed rate to unsigned for serialization
  const rateAsUnsigned = intent.fixedRateLimitBps < 0
    ? 65536 + intent.fixedRateLimitBps
    : intent.fixedRateLimitBps;

  return serializePayload(
    {
      notional: intent.notional,
      durationPeriods: intent.durationPeriods,
      fixedRateLimitBps: rateAsUnsigned,
      deadline: intent.deadline,
      slippageBps: intent.slippageBps,
      isReceiver: intent.isReceiver ? 1 : 0,
      padding: new Uint8Array(3),
    },
    FUNDING_SWAP_SCHEMA
  );
}

/**
 * Deserialize bytes to a funding swap intent
 */
export function deserializeFundingSwapIntent(bytes: Uint8Array): FundingSwapIntent {
  const data = deserializePayload(bytes, FUNDING_SWAP_SCHEMA);

  // Convert unsigned back to signed
  let rateAsSigned = data.fixedRateLimitBps as number;
  if (rateAsSigned > 32767) {
    rateAsSigned = rateAsSigned - 65536;
  }

  return {
    notional: data.notional as BN,
    durationPeriods: data.durationPeriods as number,
    fixedRateLimitBps: rateAsSigned,
    deadline: data.deadline as number,
    slippageBps: data.slippageBps as number,
    isReceiver: data.isReceiver === 1,
  };
}

/**
 * Validate funding swap intent parameters
 */
export function validateFundingSwapIntent(intent: FundingSwapIntent): void {
  if (intent.notional.lte(new BN(0))) {
    throw new Error('Notional must be positive');
  }
  if (intent.durationPeriods <= 0 || intent.durationPeriods > 65535) {
    throw new Error('Duration periods must be between 1 and 65535');
  }
  if (intent.fixedRateLimitBps < -32768 || intent.fixedRateLimitBps > 32767) {
    throw new Error('Fixed rate limit must be between -32768 and 32767 bps');
  }
  if (intent.deadline <= Date.now() / 1000) {
    throw new Error('Deadline must be in the future');
  }
  if (intent.slippageBps > 10000) {
    throw new Error('Slippage cannot exceed 100%');
  }
}
