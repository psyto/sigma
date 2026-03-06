import BN from 'bn.js';
import {
  serializeVarianceSwapIntent,
  deserializeVarianceSwapIntent,
  validateVarianceSwapIntent,
  serializeFundingSwapIntent,
  deserializeFundingSwapIntent,
  validateFundingSwapIntent,
  serializeExoticOptionIntent,
  deserializeExoticOptionIntent,
  validateExoticOptionIntent,
  ExoticOptionType,
  VARIANCE_SWAP_SCHEMA,
  FUNDING_SWAP_SCHEMA,
  EXOTIC_OPTION_SCHEMA,
} from '../schemas';
import { calculateSchemaSize } from '@veil/crypto';

describe('Payload Schemas', () => {
  describe('Schema Sizes', () => {
    it('should calculate correct variance swap schema size', () => {
      const size = calculateSchemaSize(VARIANCE_SWAP_SCHEMA);
      expect(size).toBe(40);
    });

    it('should calculate correct funding swap schema size', () => {
      const size = calculateSchemaSize(FUNDING_SWAP_SCHEMA);
      expect(size).toBe(26);
    });

    it('should calculate correct exotic option schema size', () => {
      const size = calculateSchemaSize(EXOTIC_OPTION_SCHEMA);
      expect(size).toBe(42);
    });
  });

  describe('Variance Swap Serialization', () => {
    const validIntent = {
      notional: new BN(1_000_000_000),
      premiumLimit: new BN(50_000_000),
      strikeVarianceBps: new BN(5000),
      deadline: Math.floor(Date.now() / 1000) + 3600,
      slippageBps: 100,
      isLong: true,
    };

    it('should serialize to correct length', () => {
      const serialized = serializeVarianceSwapIntent(validIntent);
      expect(serialized.length).toBe(40);
    });

    it('should round-trip serialize/deserialize', () => {
      const serialized = serializeVarianceSwapIntent(validIntent);
      const deserialized = deserializeVarianceSwapIntent(serialized);

      expect(deserialized.notional.toString()).toBe(validIntent.notional.toString());
      expect(deserialized.premiumLimit.toString()).toBe(validIntent.premiumLimit.toString());
      expect(deserialized.strikeVarianceBps.toString()).toBe(validIntent.strikeVarianceBps.toString());
      expect(deserialized.deadline).toBe(validIntent.deadline);
      expect(deserialized.slippageBps).toBe(validIntent.slippageBps);
      expect(deserialized.isLong).toBe(validIntent.isLong);
    });

    it('should handle isLong=false correctly', () => {
      const shortIntent = { ...validIntent, isLong: false };
      const serialized = serializeVarianceSwapIntent(shortIntent);
      const deserialized = deserializeVarianceSwapIntent(serialized);
      expect(deserialized.isLong).toBe(false);
    });

    it('should handle large notional values', () => {
      const largeIntent = {
        ...validIntent,
        notional: new BN('18446744073709551615'), // max u64
      };
      const serialized = serializeVarianceSwapIntent(largeIntent);
      const deserialized = deserializeVarianceSwapIntent(serialized);
      expect(deserialized.notional.toString()).toBe(largeIntent.notional.toString());
    });
  });

  describe('Variance Swap Validation', () => {
    const validIntent = {
      notional: new BN(1_000_000_000),
      premiumLimit: new BN(50_000_000),
      strikeVarianceBps: new BN(5000),
      deadline: Math.floor(Date.now() / 1000) + 3600,
      slippageBps: 100,
      isLong: true,
    };

    it('should pass validation for valid intent', () => {
      expect(() => validateVarianceSwapIntent(validIntent)).not.toThrow();
    });

    it('should reject zero notional', () => {
      expect(() =>
        validateVarianceSwapIntent({ ...validIntent, notional: new BN(0) })
      ).toThrow('Notional must be positive');
    });

    it('should reject negative notional', () => {
      expect(() =>
        validateVarianceSwapIntent({ ...validIntent, notional: new BN(-1) })
      ).toThrow('Notional must be positive');
    });

    it('should reject zero strike variance', () => {
      expect(() =>
        validateVarianceSwapIntent({ ...validIntent, strikeVarianceBps: new BN(0) })
      ).toThrow('Strike variance must be positive');
    });

    it('should reject past deadline', () => {
      expect(() =>
        validateVarianceSwapIntent({
          ...validIntent,
          deadline: Math.floor(Date.now() / 1000) - 100,
        })
      ).toThrow('Deadline must be in the future');
    });

    it('should reject slippage over 100%', () => {
      expect(() =>
        validateVarianceSwapIntent({ ...validIntent, slippageBps: 10001 })
      ).toThrow('Slippage cannot exceed 100%');
    });
  });

  describe('Funding Swap Serialization', () => {
    const validIntent = {
      notional: new BN(500_000_000),
      durationPeriods: 30,
      fixedRateLimitBps: 50,
      deadline: Math.floor(Date.now() / 1000) + 7200,
      slippageBps: 50,
      isReceiver: true,
    };

    it('should serialize to correct length', () => {
      const serialized = serializeFundingSwapIntent(validIntent);
      expect(serialized.length).toBe(26);
    });

    it('should handle negative fixed rate', () => {
      const negativeRateIntent = { ...validIntent, fixedRateLimitBps: -100 };
      const serialized = serializeFundingSwapIntent(negativeRateIntent);
      const deserialized = deserializeFundingSwapIntent(serialized);
      expect(deserialized.fixedRateLimitBps).toBe(-100);
    });

    it('should handle edge case fixed rates', () => {
      const maxPositive = { ...validIntent, fixedRateLimitBps: 32767 };
      const maxNegative = { ...validIntent, fixedRateLimitBps: -32768 };

      const serializedPos = serializeFundingSwapIntent(maxPositive);
      const serializedNeg = serializeFundingSwapIntent(maxNegative);

      const deserializedPos = deserializeFundingSwapIntent(serializedPos);
      const deserializedNeg = deserializeFundingSwapIntent(serializedNeg);

      expect(deserializedPos.fixedRateLimitBps).toBe(32767);
      expect(deserializedNeg.fixedRateLimitBps).toBe(-32768);
    });
  });

  describe('Exotic Option Serialization', () => {
    const validIntent = {
      notional: new BN(2_000_000_000),
      strikePrice: new BN(50_000_000_000),
      barrierPrice: new BN(55_000_000_000),
      durationDays: 30,
      deadline: Math.floor(Date.now() / 1000) + 1800,
      slippageBps: 200,
      optionType: ExoticOptionType.UpAndOutCall,
    };

    it('should serialize to correct length', () => {
      const serialized = serializeExoticOptionIntent(validIntent);
      expect(serialized.length).toBe(42);
    });

    it('should round-trip all option types', () => {
      const optionTypes = [
        ExoticOptionType.AsianCall,
        ExoticOptionType.AsianPut,
        ExoticOptionType.UpAndOutCall,
        ExoticOptionType.DownAndOutCall,
        ExoticOptionType.UpAndOutPut,
        ExoticOptionType.DownAndOutPut,
        ExoticOptionType.UpAndInCall,
        ExoticOptionType.DownAndInCall,
        ExoticOptionType.UpAndInPut,
        ExoticOptionType.DownAndInPut,
      ];

      for (const optionType of optionTypes) {
        const intent = { ...validIntent, optionType };
        const serialized = serializeExoticOptionIntent(intent);
        const deserialized = deserializeExoticOptionIntent(serialized);
        expect(deserialized.optionType).toBe(optionType);
      }
    });
  });

  describe('Exotic Option Validation', () => {
    it('should reject up barrier below strike for up-and-out call', () => {
      const invalidIntent = {
        notional: new BN(1_000_000),
        strikePrice: new BN(50_000),
        barrierPrice: new BN(45_000), // Below strike
        durationDays: 30,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        optionType: ExoticOptionType.UpAndOutCall,
      };

      expect(() => validateExoticOptionIntent(invalidIntent)).toThrow(
        'Up barrier must be above strike price'
      );
    });

    it('should reject down barrier above strike for down-and-out call', () => {
      const invalidIntent = {
        notional: new BN(1_000_000),
        strikePrice: new BN(50_000),
        barrierPrice: new BN(55_000), // Above strike
        durationDays: 30,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        optionType: ExoticOptionType.DownAndOutCall,
      };

      expect(() => validateExoticOptionIntent(invalidIntent)).toThrow(
        'Down barrier must be below strike price'
      );
    });

    it('should reject duration over 365 days', () => {
      const invalidIntent = {
        notional: new BN(1_000_000),
        strikePrice: new BN(50_000),
        barrierPrice: new BN(0),
        durationDays: 400,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        slippageBps: 100,
        optionType: ExoticOptionType.AsianCall,
      };

      expect(() => validateExoticOptionIntent(invalidIntent)).toThrow(
        'Duration must be between 1 and 365 days'
      );
    });
  });
});
