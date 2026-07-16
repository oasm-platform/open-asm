import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import {
  getActiveEncryptionKey,
  parseEncryptionKeys,
} from './encryption.util';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const DEK_LENGTH = 32; // 256 bits for AES-256

/**
 * Generate a random 32-byte Data Encryption Key (DEK).
 * Each workspace gets its own DEK.
 */
export function generateDEK(): Buffer {
  return randomBytes(DEK_LENGTH);
}

/**
 * Wrap (encrypt) a DEK with the system KEK.
 * Uses the active key (last in ENCRYPTION_KEYS).
 * Returns "{activeIndex}:ivHex:encryptedHex" for storage in workspaces.dek.
 *
 * The index prefix enables O(1) key lookup during unwrap — critical for
 * key rotation: DEK wrapped with key-0 remains decryptable after adding key-1.
 */
export function wrapDEK(dek: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getActiveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  const allKeys = parseEncryptionKeys();
  const activeIndex = allKeys.length - 1;
  return `${activeIndex}:${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Unwrap (decrypt) a wrapped DEK using the system KEK.
 * Uses key index prefix for O(1) lookup.
 * Falls back to trial decryption for legacy format (no prefix).
 */
export function unwrapDEK(wrappedDEK: string): Buffer {
  const parts = wrappedDEK.split(':');
  const firstPartIsIndex = parts.length >= 3 && /^\d+$/.test(parts[0]);

  let ivHex: string, encryptedHex: string, keys: Buffer[];

  if (firstPartIsIndex) {
    const keyIndex = parseInt(parts[0], 10);
    const allKeys = parseEncryptionKeys();
    if (keyIndex < 0 || keyIndex >= allKeys.length) {
      throw new Error(
        `Invalid key index in wrapped DEK: ${keyIndex} (have ${allKeys.length} keys)`,
      );
    }
    keys = [allKeys[keyIndex]];
    ivHex = parts[1];
    encryptedHex = parts.slice(2).join(':');
  } else {
    // Legacy format — no prefix, try all keys
    keys = parseEncryptionKeys();
    ivHex = parts[0];
    encryptedHex = parts.slice(1).join(':');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch {
      // Try next key
    }
  }
  throw new Error('Failed to unwrap DEK — no valid KEK found');
}

/**
 * Encrypt data using a workspace-specific DEK.
 * Format: "ivHex:encryptedHex" (no key index — DEK is the key itself).
 */
export function encryptWithDEK(text: string, dek: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt data. Fallback chain: DEK → KEK (index prefix) → KEK trial.
 *
 * @param encryptedText - "ivHex:encryptedHex" (DEK) or "{index}:ivHex:encryptedHex" (KEK)
 * @param dek - Cleartext DEK, or null for pre-envelope-encryption workspaces
 */
export function decryptWithDEK(encryptedText: string, dek: Buffer | null): string {
  const parts = encryptedText.split(':');
  const firstPartIsIndex = parts.length >= 3 && /^\d+$/.test(parts[0]);
  const ivHex = firstPartIsIndex ? parts[1] : parts[0];
  const encryptedHex = firstPartIsIndex
    ? parts.slice(2).join(':')
    : parts.slice(1).join(':');

  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid encrypted data format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  // Layer 1: DEK (only for non-prefixed data — DEK-encrypted data has no prefix)
  if (dek !== null && !firstPartIsIndex) {
    try {
      const decipher = createDecipheriv(ALGORITHM, dek, iv);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      // DEK failed, fall through to KEK
    }
  }

  // Layer 2: KEK — leverage shared decrypt() which handles both formats
  const { decrypt } = require('./encryption.util');
  return decrypt(encryptedText);
}
