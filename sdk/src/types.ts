import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// ============================================================================
// Program IDs
// ============================================================================

export const PROGRAM_IDS = {
  SHARED_ORACLE: new PublicKey("81SjyEmtwJUeqU9ZEfc7sm9evVpDuGwRSLrFQeCF4j5o"),
  VOLSWAP: new PublicKey("FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS"),
  FUNDING_SWAP: new PublicKey("GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx"),
  EXOTIC_VAULT: new PublicKey("6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P"),
  PRIVATE_INTENTS: new PublicKey("PvtInt11111111111111111111111111111111111"),
} as const;

// ============================================================================
// Oracle Types
// ============================================================================

export interface PriceFeed {
  authority: PublicKey;
  assetMint: PublicKey;
  symbol: string;
  latestPrice: BN;
  latestTimestamp: BN;
  confidence: BN;
  sampleInterval: BN;
  maxSamples: number;
  isActive: boolean;
  bump: number;
}

export interface FundingFeed {
  authority: PublicKey;
  marketSymbol: string;
  latestRate: BN;
  latestTimestamp: BN;
  fundingInterval: BN;
  cumulativeFunding: BN;
  isActive: boolean;
  bump: number;
}

export interface VarianceTracker {
  authority: PublicKey;
  priceFeed: PublicKey;
  epochDuration: BN;
  currentEpoch: BN;
  epochStartTime: BN;
  sampleCount: number;
  sumSquaredReturns: BN;
  realizedVariance: BN;
  annualizedVolatility: BN;
  bump: number;
}

export interface VolatilityIndex {
  authority: PublicKey;
  name: string;
  currentLevel: BN;
  lastUpdateTime: BN;
  componentCount: number;
  isActive: boolean;
  bump: number;
}

export interface CexFundingFeed {
  authority: PublicKey;
  marketSymbol: string;
  aggregatedRate: BN;
  lastUpdateTime: BN;
  exchangeCount: number;
  isActive: boolean;
  bump: number;
}

export interface PositionToken {
  owner: PublicKey;
  originalProgram: PublicKey;
  originalPosition: PublicKey;
  positionType: PositionType;
  notionalValue: BN;
  createdAt: BN;
  expiresAt: BN;
  isListed: boolean;
  listPrice: BN | null;
  bump: number;
}

export type PositionType =
  | { varianceSwap: {} }
  | { fundingSwap: {} }
  | { exoticOption: {} };

// ============================================================================
// Volswap Types
// ============================================================================

export interface VariancePool {
  authority: PublicKey;
  collateralMint: PublicKey;
  underlyingMint: PublicKey;
  priceFeed: PublicKey;
  varianceTracker: PublicKey;
  epochDurationSeconds: BN;
  minNotional: BN;
  maxNotional: BN;
  feeRateBps: number;
  initialStrikeVarianceBps: BN;
  varianceCapBps: BN;
  earlyExitPenaltyBps: number;
  currentEpoch: BN;
  currentStrikeVarianceBps: BN;
  totalLpShares: BN;
  totalLiquidity: BN;
  totalLongNotional: BN;
  totalShortNotional: BN;
  isActive: boolean;
  isEpochSettled: boolean;
  bump: number;
  vaultBump: number;
}

export interface VariancePosition {
  owner: PublicKey;
  pool: PublicKey;
  epoch: BN;
  isLong: boolean;
  notional: BN;
  strikeVarianceBps: BN;
  premiumPaid: BN;
  entryTime: BN;
  status: PositionStatus;
  payout: BN;
  bump: number;
}

export type PositionStatus =
  | { active: {} }
  | { settled: {} }
  | { claimed: {} }
  | { closedEarly: {} };

export interface LiquidityProvider {
  owner: PublicKey;
  pool: PublicKey;
  shares: BN;
  depositedAmount: BN;
  totalWithdrawn: BN;
  feesClaimed: BN;
  depositedAt: BN;
  lastInteraction: BN;
  bump: number;
}

// ============================================================================
// Funding Swap Types
// ============================================================================

export interface FundingPool {
  authority: PublicKey;
  collateralMint: PublicKey;
  fundingFeed: PublicKey;
  marketSymbol: string;
  swapDurationSeconds: BN;
  minNotional: BN;
  maxNotional: BN;
  feeRateBps: number;
  maxRateSpreadBps: number;
  totalLpShares: BN;
  totalLiquidity: BN;
  totalReceiveFixedNotional: BN;
  totalPayFixedNotional: BN;
  isActive: boolean;
  bump: number;
  vaultBump: number;
}

export interface FundingSwapPosition {
  owner: PublicKey;
  pool: PublicKey;
  swapId: BN;
  isReceiveFixed: boolean;
  notional: BN;
  fixedRateBps: BN;
  collateralDeposited: BN;
  startTime: BN;
  endTime: BN;
  lastFundingTime: BN;
  totalPayments: BN;
  status: SwapStatus;
  bump: number;
}

export type SwapStatus =
  | { active: {} }
  | { settled: {} }
  | { closedEarly: {} };

// ============================================================================
// Exotic Vault Types
// ============================================================================

export interface ExoticVault {
  authority: PublicKey;
  collateralMint: PublicKey;
  underlyingMint: PublicKey;
  priceFeed: PublicKey;
  minNotional: BN;
  maxNotional: BN;
  minDurationDays: number;
  maxDurationDays: number;
  feeRateBps: number;
  sampleIntervalSeconds: BN;
  totalOptions: BN;
  totalVolume: BN;
  totalPremiumsCollected: BN;
  totalFeesCollected: BN;
  totalPayouts: BN;
  totalLpShares: BN;
  totalLiquidity: BN;
  accumulatedLpFees: BN;
  activeOptions: BN;
  totalExposure: BN;
  isActive: boolean;
  bump: number;
  collateralVaultBump: number;
}

export interface ExoticOption {
  owner: PublicKey;
  vault: PublicKey;
  optionIndex: BN;
  optionType: OptionType;
  strikePrice: BN;
  barrierPrice: BN | null;
  notional: BN;
  premiumPaid: BN;
  durationDays: number;
  startTime: BN;
  expiryTime: BN;
  barrierBreached: boolean;
  barrierBreachTime: BN | null;
  barrierBreachPrice: BN | null;
  settlementPrice: BN | null;
  payoutAmount: BN;
  status: OptionStatus;
  settledAt: BN | null;
  bump: number;
}

export type OptionType =
  | { asianCall: {} }
  | { asianPut: {} }
  | { upAndOutCall: {} }
  | { downAndOutCall: {} }
  | { upAndOutPut: {} }
  | { downAndOutPut: {} }
  | { upAndInCall: {} }
  | { downAndInCall: {} }
  | { upAndInPut: {} }
  | { downAndInPut: {} };

export type OptionStatus =
  | { active: {} }
  | { knockedOut: {} }
  | { knockedIn: {} }
  | { settled: {} }
  | { claimed: {} }
  | { expired: {} };

export interface PriceSampleBuffer {
  option: PublicKey;
  samples: PriceSample[];
  twap: BN;
  bump: number;
}

export interface PriceSample {
  price: BN;
  timestamp: BN;
}

// ============================================================================
// SDK Configuration
// ============================================================================

export interface SigmaConfig {
  cluster: "devnet" | "mainnet-beta" | "localnet";
  commitment?: "processed" | "confirmed" | "finalized";
}

export const DEFAULT_CONFIG: SigmaConfig = {
  cluster: "devnet",
  commitment: "confirmed",
};
