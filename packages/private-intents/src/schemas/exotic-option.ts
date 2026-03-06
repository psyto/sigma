import { PayloadSchema, serializePayload, deserializePayload } from '@veil/crypto';
import BN from 'bn.js';

/**
 * Exotic option types supported by Sigma
 */
export enum ExoticOptionType {
  AsianCall = 0,
  AsianPut = 1,
  UpAndOutCall = 2,
  DownAndOutCall = 3,
  UpAndOutPut = 4,
  DownAndOutPut = 5,
  UpAndInCall = 6,
  DownAndInCall = 7,
  UpAndInPut = 8,
  DownAndInPut = 9,
}

/**
 * Exotic Option Intent Payload
 *
 * Encodes the private parameters for an exotic option:
 * - notional: Position size in collateral tokens
 * - strikePrice: Strike price (scaled by 10^6 for precision)
 * - barrierPrice: Barrier price for knock-in/knock-out options (0 for Asian)
 * - durationDays: Option duration in days
 * - deadline: Unix timestamp after which order expires
 * - slippageBps: Maximum slippage tolerance on premium
 * - optionType: Type of exotic option (enum value)
 */
export interface ExoticOptionIntent {
  notional: BN;
  strikePrice: BN;
  barrierPrice: BN;
  durationDays: number;
  deadline: number;
  slippageBps: number;
  optionType: ExoticOptionType;
}

/**
 * Schema for exotic option intent payload (42 bytes)
 * When encrypted with NaCl box, becomes ~82 bytes
 */
export const EXOTIC_OPTION_SCHEMA: PayloadSchema = {
  fields: [
    { name: 'notional', type: 'u64' },           // 8 bytes
    { name: 'strikePrice', type: 'u64' },        // 8 bytes
    { name: 'barrierPrice', type: 'u64' },       // 8 bytes
    { name: 'durationDays', type: 'u16' },       // 2 bytes
    { name: 'deadline', type: 'i64' },           // 8 bytes
    { name: 'slippageBps', type: 'u16' },        // 2 bytes
    { name: 'optionType', type: 'u8' },          // 1 byte
    { name: 'padding', type: 'bytes', size: 5 }, // 5 bytes (alignment)
  ],
};

/**
 * Serialize an exotic option intent to bytes
 */
export function serializeExoticOptionIntent(intent: ExoticOptionIntent): Uint8Array {
  return serializePayload(
    {
      notional: intent.notional,
      strikePrice: intent.strikePrice,
      barrierPrice: intent.barrierPrice,
      durationDays: intent.durationDays,
      deadline: intent.deadline,
      slippageBps: intent.slippageBps,
      optionType: intent.optionType,
      padding: new Uint8Array(5),
    },
    EXOTIC_OPTION_SCHEMA
  );
}

/**
 * Deserialize bytes to an exotic option intent
 */
export function deserializeExoticOptionIntent(bytes: Uint8Array): ExoticOptionIntent {
  const data = deserializePayload(bytes, EXOTIC_OPTION_SCHEMA);
  return {
    notional: data.notional as BN,
    strikePrice: data.strikePrice as BN,
    barrierPrice: data.barrierPrice as BN,
    durationDays: data.durationDays as number,
    deadline: data.deadline as number,
    slippageBps: data.slippageBps as number,
    optionType: data.optionType as ExoticOptionType,
  };
}

/**
 * Validate exotic option intent parameters
 */
export function validateExoticOptionIntent(intent: ExoticOptionIntent): void {
  if (intent.notional.lte(new BN(0))) {
    throw new Error('Notional must be positive');
  }
  if (intent.strikePrice.lte(new BN(0))) {
    throw new Error('Strike price must be positive');
  }

  // Barrier validation for barrier options
  const isBarrierOption = intent.optionType >= ExoticOptionType.UpAndOutCall;
  if (isBarrierOption && intent.barrierPrice.lte(new BN(0))) {
    throw new Error('Barrier price must be positive for barrier options');
  }

  // Validate barrier direction
  if (intent.optionType === ExoticOptionType.UpAndOutCall ||
      intent.optionType === ExoticOptionType.UpAndOutPut ||
      intent.optionType === ExoticOptionType.UpAndInCall ||
      intent.optionType === ExoticOptionType.UpAndInPut) {
    if (intent.barrierPrice.lte(intent.strikePrice)) {
      throw new Error('Up barrier must be above strike price');
    }
  }

  if (intent.optionType === ExoticOptionType.DownAndOutCall ||
      intent.optionType === ExoticOptionType.DownAndOutPut ||
      intent.optionType === ExoticOptionType.DownAndInCall ||
      intent.optionType === ExoticOptionType.DownAndInPut) {
    if (intent.barrierPrice.gte(intent.strikePrice)) {
      throw new Error('Down barrier must be below strike price');
    }
  }

  if (intent.durationDays <= 0 || intent.durationDays > 365) {
    throw new Error('Duration must be between 1 and 365 days');
  }
  if (intent.deadline <= Date.now() / 1000) {
    throw new Error('Deadline must be in the future');
  }
  if (intent.slippageBps > 10000) {
    throw new Error('Slippage cannot exceed 100%');
  }
  if (intent.optionType < 0 || intent.optionType > 9) {
    throw new Error('Invalid option type');
  }
}

/**
 * Get human-readable name for option type
 */
export function getOptionTypeName(optionType: ExoticOptionType): string {
  const names: Record<ExoticOptionType, string> = {
    [ExoticOptionType.AsianCall]: 'Asian Call',
    [ExoticOptionType.AsianPut]: 'Asian Put',
    [ExoticOptionType.UpAndOutCall]: 'Up-and-Out Call',
    [ExoticOptionType.DownAndOutCall]: 'Down-and-Out Call',
    [ExoticOptionType.UpAndOutPut]: 'Up-and-Out Put',
    [ExoticOptionType.DownAndOutPut]: 'Down-and-Out Put',
    [ExoticOptionType.UpAndInCall]: 'Up-and-In Call',
    [ExoticOptionType.DownAndInCall]: 'Down-and-In Call',
    [ExoticOptionType.UpAndInPut]: 'Up-and-In Put',
    [ExoticOptionType.DownAndInPut]: 'Down-and-In Put',
  };
  return names[optionType] || 'Unknown';
}
