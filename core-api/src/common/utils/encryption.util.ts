import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { DEFAULT_ENCRYPTION_KEY } from '../constants/app.constants';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Parse ENCRYPTION_KEYS env var into SHA-256 hashed key buffers.
 * Format: "key-v1,key-v2,key-v3" — comma-separated.
 * Falls back to DEFAULT_ENCRYPTION_KEY if env var is not set.
 *
 * Last key = active (used for encrypt).
 * All keys = valid for decrypt.
 *
 * Key rotation: append a new key → new data encrypted with new key,
 * old data still decryptable via index prefix lookup.
 */
export function parseEncryptionKeys(): Buffer[] {
  const raw = process.env.ENCRYPTION_KEYS;
  const keys = raw
    ? raw.split(',').map((k) => k.trim()).filter(Boolean)
    : [DEFAULT_ENCRYPTION_KEY];
  return keys.map((k) => createHash('sha256').update(k).digest());
}

/**
 * Returns the active (latest) encryption key for encrypting new data.
 * Always the last key in ENCRYPTION_KEYS list.
 */
export function getActiveEncryptionKey(): Buffer {
  const keys = parseEncryptionKeys();
  return keys[keys.length - 1];
}

/**
 * Encrypt plaintext with the active KEK.
 * Output format: "{activeIndex}:ivHex:encryptedHex"
 * Index is the position in ENCRYPTION_KEYS (0-based), enabling O(1) decrypt.
 *
 * @deprecated For workspace-scoped encryption, use encryptWithDEK instead.
 */
export function encrypt(text: string): string {
  const keys = parseEncryptionKeys();
  const activeIndex = keys.length - 1;
  const key = keys[activeIndex];
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${activeIndex}:${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt ciphertext. Supports both new and old formats:
 * - New: "{index}:ivHex:encryptedHex" → O(1) key lookup by index
 * - Old: "ivHex:encryptedHex" (no prefix) → tries all keys (O(n), backward compat)
 *
 * @deprecated For workspace-scoped decryption, use decryptWithDEK instead.
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');

  // Detect format: if first part is numeric and has 3+ segments, it's the key index
  const firstPartIsIndex = parts.length >= 3 && /^\d+$/.test(parts[0]);

  let ivHex: string, encryptedHex: string;
  let keys: Buffer[];

  if (firstPartIsIndex) {
    const keyIndex = parseInt(parts[0], 10);
    ivHex = parts[1];
    encryptedHex = parts.slice(2).join(':');
    const allKeys = parseEncryptionKeys();
    if (keyIndex < 0 || keyIndex >= allKeys.length) {
      throw new Error(`Invalid key index: ${keyIndex}`);
    }
    keys = [allKeys[keyIndex]]; // O(1) — single key
  } else {
    // Old format: no prefix, try all keys
    ivHex = parts[0];
    encryptedHex = parts.slice(1).join(':');
    keys = parseEncryptionKeys(); // all keys
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const errors: Error[] = [];
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (e) {
      errors.push(e as Error);
    }
  }

  throw new Error(
    `Decryption failed with ${keys.length} key(s): ${errors.map((e) => e.message).join('; ')}`,
  );
}
