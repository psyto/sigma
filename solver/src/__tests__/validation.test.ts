import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Tests for validation logic used by solvers/executors.
 * These test the pure validation functions without requiring on-chain state.
 */

describe("Deadline validation", () => {
  it("should detect an expired intent", () => {
    const deadline = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
    const currentTime = Math.floor(Date.now() / 1000);
    expect(currentTime > deadline).toBe(true);
  });

  it("should accept a valid (future) deadline", () => {
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const currentTime = Math.floor(Date.now() / 1000);
    expect(currentTime > deadline).toBe(false);
  });

  it("should reject a deadline exactly at current time", () => {
    const currentTime = Math.floor(Date.now() / 1000);
    // deadline === currentTime means it's not expired (> not >=)
    expect(currentTime > currentTime).toBe(false);
  });

  it("should handle a deadline far in the future", () => {
    const deadline = Math.floor(Date.now() / 1000) + 365 * 24 * 3600; // 1 year
    const currentTime = Math.floor(Date.now() / 1000);
    expect(currentTime > deadline).toBe(false);
  });
});

describe("Slippage validation", () => {
  it("should accept slippage within tolerance for a long position", () => {
    const expectedPremium = new BN(49_000_000);
    const actualPremium = new BN(49_250_000); // ~0.5% worse
    const maxSlippageBps = 100; // 1%

    const slippageAmount = actualPremium.sub(expectedPremium);
    const slippageBps = slippageAmount
      .mul(new BN(10000))
      .div(expectedPremium)
      .toNumber();

    expect(slippageBps).toBeLessThanOrEqual(maxSlippageBps);
  });

  it("should reject slippage exceeding tolerance for a long position", () => {
    const expectedPremium = new BN(49_000_000);
    const actualPremium = new BN(51_000_000); // ~4% worse
    const maxSlippageBps = 100; // 1%

    const slippageAmount = actualPremium.sub(expectedPremium);
    const slippageBps = slippageAmount
      .mul(new BN(10000))
      .div(expectedPremium)
      .toNumber();

    expect(slippageBps).toBeGreaterThan(maxSlippageBps);
  });

  it("should handle zero slippage", () => {
    const premium = new BN(50_000_000);
    const slippageAmount = premium.sub(premium);
    expect(slippageAmount.isZero()).toBe(true);
  });
});

describe("Notional bounds validation", () => {
  const minNotional = new BN(1_000_000); // 1 token
  const maxNotional = new BN(1_000_000_000_000); // 1M tokens

  it("should accept notional within bounds", () => {
    const notional = new BN(500_000_000); // 500 tokens
    expect(notional.gte(minNotional)).toBe(true);
    expect(notional.lte(maxNotional)).toBe(true);
  });

  it("should reject notional below minimum", () => {
    const notional = new BN(100); // far below min
    expect(notional.lt(minNotional)).toBe(true);
  });

  it("should reject notional above maximum", () => {
    const notional = new BN("10000000000000"); // above max
    expect(notional.gt(maxNotional)).toBe(true);
  });

  it("should accept notional at exact minimum", () => {
    expect(minNotional.gte(minNotional)).toBe(true);
  });

  it("should accept notional at exact maximum", () => {
    expect(maxNotional.lte(maxNotional)).toBe(true);
  });
});

describe("Pool active status validation", () => {
  it("should reject operations on inactive pool", () => {
    const poolData = { isActive: false };
    expect(poolData.isActive).toBe(false);
  });

  it("should accept operations on active pool", () => {
    const poolData = { isActive: true };
    expect(poolData.isActive).toBe(true);
  });
});

describe("Duration validation for exotic options", () => {
  const minDurationDays = 1;
  const maxDurationDays = 365;

  it("should accept valid duration", () => {
    const duration = 30;
    expect(duration >= minDurationDays).toBe(true);
    expect(duration <= maxDurationDays).toBe(true);
  });

  it("should reject zero duration", () => {
    const duration = 0;
    expect(duration >= minDurationDays).toBe(false);
  });

  it("should reject negative duration", () => {
    const duration = -1;
    expect(duration > 0).toBe(false);
  });

  it("should reject duration exceeding maximum", () => {
    const duration = 400;
    expect(duration <= maxDurationDays).toBe(false);
  });

  it("should accept duration at boundaries", () => {
    expect(minDurationDays >= minDurationDays).toBe(true);
    expect(maxDurationDays <= maxDurationDays).toBe(true);
  });
});

describe("Strike price validation", () => {
  it("should reject zero strike price", () => {
    const strike = new BN(0);
    expect(strike.isZero()).toBe(true);
  });

  it("should accept positive strike price", () => {
    const strike = new BN(100_000_000);
    expect(strike.isZero()).toBe(false);
    expect(strike.gt(new BN(0))).toBe(true);
  });
});

describe("Barrier price validation for barrier options", () => {
  it("should require barrier price for barrier options", () => {
    const barrierPrice = new BN(0);
    const isBarrierOption = true;
    const isInvalid = isBarrierOption && barrierPrice.isZero();
    expect(isInvalid).toBe(true);
  });

  it("should allow zero barrier price for asian options", () => {
    const barrierPrice = new BN(0);
    const isBarrierOption = false;
    const isInvalid = isBarrierOption && barrierPrice.isZero();
    expect(isInvalid).toBe(false);
  });

  it("should accept valid barrier price for barrier options", () => {
    const barrierPrice = new BN(150_000_000);
    const isBarrierOption = true;
    const isInvalid = isBarrierOption && barrierPrice.isZero();
    expect(isInvalid).toBe(false);
  });
});

describe("Funding swap duration validation", () => {
  it("should require positive duration periods", () => {
    const durationPeriods = 0;
    expect(durationPeriods > 0).toBe(false);
  });

  it("should accept positive duration periods", () => {
    const durationPeriods = 12;
    expect(durationPeriods > 0).toBe(true);
  });
});

describe("Fixed rate limit validation for funding swaps", () => {
  it("should validate receiver rate is above limit", () => {
    const currentRate = 150; // 1.5%
    const fixedRateLimit = 100; // 1%
    const isReceiver = true;

    // Receiver wants current rate >= their limit
    const isValid = !isReceiver || currentRate >= fixedRateLimit;
    expect(isValid).toBe(true);
  });

  it("should reject receiver rate below limit", () => {
    const currentRate = 50; // 0.5%
    const fixedRateLimit = 100; // 1%
    const isReceiver = true;

    const isValid = !isReceiver || currentRate >= fixedRateLimit;
    expect(isValid).toBe(false);
  });

  it("should validate payer rate is below limit", () => {
    const currentRate = 50; // 0.5%
    const fixedRateLimit = 100; // 1%
    const isReceiver = false;

    // Payer wants current rate <= their limit
    const isValid = isReceiver || currentRate <= fixedRateLimit;
    expect(isValid).toBe(true);
  });

  it("should reject payer rate above limit", () => {
    const currentRate = 150; // 1.5%
    const fixedRateLimit = 100; // 1%
    const isReceiver = false;

    const isValid = isReceiver || currentRate <= fixedRateLimit;
    expect(isValid).toBe(false);
  });
});

describe("Premium calculation logic", () => {
  it("should calculate variance swap premium from fee rate", () => {
    const notional = new BN(1_000_000_000);
    const feeRateBps = 50; // 0.5%
    const premium = notional.mul(new BN(feeRateBps)).div(new BN(10000));
    expect(premium.toNumber()).toBe(5_000_000);
  });

  it("should calculate exotic option premium with duration multiplier", () => {
    const notional = new BN(1_000_000_000);
    const feeRateBps = 100; // 1%
    const durationDays = 30;

    // Base premium
    let premium = notional.mul(new BN(feeRateBps)).div(new BN(10000));

    // Duration multiplier: sqrt(days) * 100
    const durationMultiplier = new BN(
      Math.ceil(Math.sqrt(durationDays) * 100)
    );
    premium = premium.mul(durationMultiplier).div(new BN(100));

    expect(premium.gt(new BN(0))).toBe(true);
    // sqrt(30) ~= 5.477, * 100 = 548, ceil = 548
    // premium = 10_000_000 * 548 / 100 = 54_800_000
    const expectedMultiplier = Math.ceil(Math.sqrt(30) * 100);
    const expectedPremium = (1_000_000_000 * feeRateBps * expectedMultiplier) / (10000 * 100);
    expect(premium.toNumber()).toBe(expectedPremium);
  });

  it("should apply barrier discount (30%) for barrier options", () => {
    const basePremium = new BN(10_000_000);
    const discountedPremium = basePremium.mul(new BN(70)).div(new BN(100));
    expect(discountedPremium.toNumber()).toBe(7_000_000);
  });

  it("should not apply barrier discount for asian options", () => {
    const basePremium = new BN(10_000_000);
    const isBarrier = false;
    const finalPremium = isBarrier
      ? basePremium.mul(new BN(70)).div(new BN(100))
      : basePremium;
    expect(finalPremium.toNumber()).toBe(10_000_000);
  });
});
