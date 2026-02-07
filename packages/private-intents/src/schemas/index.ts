// Import schemas for use in getSchemaForIntentType
import { VARIANCE_SWAP_SCHEMA } from './variance-swap';
import { FUNDING_SWAP_SCHEMA } from './funding-swap';
import { EXOTIC_OPTION_SCHEMA } from './exotic-option';

// Re-export all schemas
export {
  VarianceSwapIntent,
  VARIANCE_SWAP_SCHEMA,
  serializeVarianceSwapIntent,
  deserializeVarianceSwapIntent,
  validateVarianceSwapIntent,
} from './variance-swap';

export {
  FundingSwapIntent,
  FUNDING_SWAP_SCHEMA,
  serializeFundingSwapIntent,
  deserializeFundingSwapIntent,
  validateFundingSwapIntent,
} from './funding-swap';

export {
  ExoticOptionType,
  ExoticOptionIntent,
  EXOTIC_OPTION_SCHEMA,
  serializeExoticOptionIntent,
  deserializeExoticOptionIntent,
  validateExoticOptionIntent,
  getOptionTypeName,
} from './exotic-option';

/**
 * Intent types supported by the private intent protocol
 */
export enum IntentType {
  VarianceSwap = 0,
  FundingSwap = 1,
  ExoticOption = 2,
}

/**
 * Get the schema for a given intent type
 */
export function getSchemaForIntentType(intentType: IntentType) {
  switch (intentType) {
    case IntentType.VarianceSwap:
      return { schema: VARIANCE_SWAP_SCHEMA, name: 'Variance Swap' };
    case IntentType.FundingSwap:
      return { schema: FUNDING_SWAP_SCHEMA, name: 'Funding Swap' };
    case IntentType.ExoticOption:
      return { schema: EXOTIC_OPTION_SCHEMA, name: 'Exotic Option' };
    default:
      throw new Error(`Unknown intent type: ${intentType}`);
  }
}
