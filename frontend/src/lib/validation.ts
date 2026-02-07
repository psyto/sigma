/**
 * Form validation utilities for Sigma Protocol
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ValidationRules {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => ValidationResult;
}

/**
 * Validate a numeric amount
 */
export function validateAmount(
  value: string | number,
  options: {
    required?: boolean;
    min?: number;
    max?: number;
    fieldName?: string;
  } = {}
): ValidationResult {
  const { required = true, min = 0, max, fieldName = "Amount" } = options;
  const numValue = typeof value === "string" ? parseFloat(value) : value;

  if (required && (value === "" || value === null || value === undefined)) {
    return { isValid: false, error: `${fieldName} is required` };
  }

  if (value === "" && !required) {
    return { isValid: true };
  }

  if (isNaN(numValue)) {
    return { isValid: false, error: `${fieldName} must be a valid number` };
  }

  if (numValue < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}` };
  }

  if (max !== undefined && numValue > max) {
    return { isValid: false, error: `${fieldName} cannot exceed ${max}` };
  }

  return { isValid: true };
}

/**
 * Validate a positive amount (greater than 0)
 */
export function validatePositiveAmount(
  value: string | number,
  options: {
    max?: number;
    fieldName?: string;
  } = {}
): ValidationResult {
  return validateAmount(value, { ...options, min: 0.000001 });
}

/**
 * Validate strike price
 */
export function validateStrikePrice(value: string | number): ValidationResult {
  const result = validatePositiveAmount(value, { fieldName: "Strike price" });
  if (!result.isValid) return result;

  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (numValue > 1000000) {
    return { isValid: false, error: "Strike price is unreasonably high" };
  }

  return { isValid: true };
}

/**
 * Validate duration in days
 */
export function validateDuration(
  value: string | number,
  options: {
    min?: number;
    max?: number;
  } = {}
): ValidationResult {
  const { min = 1, max = 365 } = options;
  const numValue = typeof value === "string" ? parseInt(value) : value;

  if (isNaN(numValue) || !Number.isInteger(numValue)) {
    return { isValid: false, error: "Duration must be a whole number of days" };
  }

  if (numValue < min) {
    return { isValid: false, error: `Duration must be at least ${min} day${min > 1 ? "s" : ""}` };
  }

  if (numValue > max) {
    return { isValid: false, error: `Duration cannot exceed ${max} days` };
  }

  return { isValid: true };
}

/**
 * Validate percentage/rate input (0-100 or basis points)
 */
export function validateRate(
  value: string | number,
  options: {
    isBasisPoints?: boolean;
    min?: number;
    max?: number;
    fieldName?: string;
  } = {}
): ValidationResult {
  const { isBasisPoints = false, min = 0, max = isBasisPoints ? 10000 : 100, fieldName = "Rate" } = options;
  const numValue = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return { isValid: false, error: `${fieldName} must be a valid number` };
  }

  if (numValue < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}${isBasisPoints ? " bps" : "%"}` };
  }

  if (numValue > max) {
    return { isValid: false, error: `${fieldName} cannot exceed ${max}${isBasisPoints ? " bps" : "%"}` };
  }

  return { isValid: true };
}

/**
 * Validate notional amount against user balance
 */
export function validateAgainstBalance(
  amount: string | number,
  balance: number,
  options: {
    fieldName?: string;
  } = {}
): ValidationResult {
  const { fieldName = "Amount" } = options;
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return { isValid: false, error: `${fieldName} must be a valid number` };
  }

  if (numAmount > balance) {
    return { isValid: false, error: `Insufficient balance. Available: ${balance.toFixed(2)}` };
  }

  return { isValid: true };
}

/**
 * Validate barrier price relative to strike
 */
export function validateBarrierPrice(
  barrierPrice: string | number,
  strikePrice: string | number,
  isUpBarrier: boolean
): ValidationResult {
  const barrier = typeof barrierPrice === "string" ? parseFloat(barrierPrice) : barrierPrice;
  const strike = typeof strikePrice === "string" ? parseFloat(strikePrice) : strikePrice;

  if (isNaN(barrier) || barrier <= 0) {
    return { isValid: false, error: "Barrier price must be a positive number" };
  }

  if (isNaN(strike) || strike <= 0) {
    return { isValid: false, error: "Strike price must be set first" };
  }

  if (isUpBarrier && barrier <= strike) {
    return { isValid: false, error: "Up barrier must be above strike price" };
  }

  if (!isUpBarrier && barrier >= strike) {
    return { isValid: false, error: "Down barrier must be below strike price" };
  }

  return { isValid: true };
}

/**
 * Combine multiple validation results
 */
export function combineValidations(...results: ValidationResult[]): ValidationResult {
  for (const result of results) {
    if (!result.isValid) {
      return result;
    }
  }
  return { isValid: true };
}

/**
 * Create a form validator for a specific form configuration
 */
export function createFormValidator<T extends Record<string, any>>(
  rules: Record<keyof T, ValidationRules>
) {
  return (values: T): Record<keyof T, string | undefined> => {
    const errors: Record<string, string | undefined> = {};

    for (const [field, fieldRules] of Object.entries(rules)) {
      const value = values[field as keyof T];

      if (fieldRules.required && (value === "" || value === null || value === undefined)) {
        errors[field] = `${field} is required`;
        continue;
      }

      if (typeof value === "number" || (typeof value === "string" && !isNaN(parseFloat(value)))) {
        const numValue = typeof value === "string" ? parseFloat(value) : value;

        if (fieldRules.min !== undefined && numValue < fieldRules.min) {
          errors[field] = `${field} must be at least ${fieldRules.min}`;
          continue;
        }

        if (fieldRules.max !== undefined && numValue > fieldRules.max) {
          errors[field] = `${field} cannot exceed ${fieldRules.max}`;
          continue;
        }
      }

      if (typeof value === "string") {
        if (fieldRules.minLength !== undefined && value.length < fieldRules.minLength) {
          errors[field] = `${field} must be at least ${fieldRules.minLength} characters`;
          continue;
        }

        if (fieldRules.maxLength !== undefined && value.length > fieldRules.maxLength) {
          errors[field] = `${field} cannot exceed ${fieldRules.maxLength} characters`;
          continue;
        }

        if (fieldRules.pattern !== undefined && !fieldRules.pattern.test(value)) {
          errors[field] = `${field} has an invalid format`;
          continue;
        }
      }

      if (fieldRules.custom) {
        const customResult = fieldRules.custom(value);
        if (!customResult.isValid) {
          errors[field] = customResult.error;
        }
      }
    }

    return errors as Record<keyof T, string | undefined>;
  };
}

/**
 * Hook-style validation helper
 */
export function useFormValidation<T extends Record<string, any>>(
  values: T,
  validators: Record<keyof T, (value: any) => ValidationResult>
): {
  errors: Record<keyof T, string | undefined>;
  isValid: boolean;
  validateField: (field: keyof T) => ValidationResult;
} {
  const errors: Record<string, string | undefined> = {};
  let isValid = true;

  for (const [field, validator] of Object.entries(validators)) {
    const result = validator(values[field as keyof T]);
    if (!result.isValid) {
      errors[field] = result.error;
      isValid = false;
    }
  }

  const validateField = (field: keyof T): ValidationResult => {
    const validator = validators[field];
    if (!validator) return { isValid: true };
    return validator(values[field]);
  };

  return {
    errors: errors as Record<keyof T, string | undefined>,
    isValid,
    validateField,
  };
}
