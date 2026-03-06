/**
 * Re-export encryption primitives from @veil/crypto
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
} from '@veil/crypto';

// Threshold secret sharing (for future M-of-N governance)
export {
  SecretShare,
  ThresholdConfig,
  splitSecret,
  combineShares,
  verifyShares,
  createThresholdEncryption,
  decryptWithThreshold,
} from '@veil/crypto';

// Payload serialization
export {
  FieldType,
  FieldDef,
  PayloadSchema,
  calculateSchemaSize,
  serializePayload,
  deserializePayload,
} from '@veil/crypto';
