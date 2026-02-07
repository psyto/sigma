/**
 * Re-export encryption primitives from @privacy-suite/crypto
 *
 * This module provides NaCl box encryption (Curve25519-XSalsa20-Poly1305)
 * and threshold secret sharing for the private intent protocol.
 */

// NaCl Box encryption
export {
  EncryptionKeypair,
  EncryptedData,
  generateEncryptionKeypair,
  deriveEncryptionKeypair,
  encrypt,
  decrypt,
  encryptForMultiple,
  encryptionKeyToBase58,
  base58ToEncryptionKey,
  validateEncryptedData,
} from '@privacy-suite/crypto';

// Threshold secret sharing (for future M-of-N governance)
export {
  SecretShare,
  ThresholdConfig,
  splitSecret,
  combineShares,
  verifyShares,
  createThresholdEncryption,
  decryptWithThreshold,
} from '@privacy-suite/crypto';

// Payload serialization
export {
  FieldType,
  FieldDef,
  PayloadSchema,
  calculateSchemaSize,
  serializePayload,
  deserializePayload,
} from '@privacy-suite/crypto';
