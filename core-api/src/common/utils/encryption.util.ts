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
 *
 * SECURITY: this used to fall back to the hard-coded constant
 * `DEFAULT_ENCRYPTION_KEY` (`'OASM_DEFAULT_ENCRYPTION_KEY'`) when the env var
 * was absent. That KEK is published in the repository, so every workspace DEK,
 * encrypted column and report-download HMAC became decryptable/forgeable by
 * anyone with the source. It also rejected the literal placeholder shipped in
 * `example.env` (`your-encryption-key-change-in-production`), which has the
 * same problem. Now it throws instead — see ENCRYPTION_KEYS in example.env.
 *
 * Last key = active (used for encrypt).
 * All keys = valid for decrypt.
 *
 * Key rotation: append a new key → new data encrypted with new key,
 * old data still decryptable via index prefix lookup.
 */
export function parseEncryptionKeys(): Buffer[] {
  const raw = process.env.ENCRYPTION_KEYS;
  if (process.env.NODE_ENV !== 'test' && !raw?.trim()) {
    throw new Error(
      'ENCRYPTION_KEYS is not set. Generate one with `openssl rand -base64 32` ' +
        'and add it to core-api/.env (see core-api/example.env). The application ' +
        'refuses to start with a hard-coded key-encryption key.',
    );
  }
  const keys = (raw ?? DEFAULT_ENCRYPTION_KEY)
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    throw new Error('ENCRYPTION_KEYS is empty; at least one key is required.');
  }

  // Only the ACTIVE (last) key is validated. A legacy placeholder may remain
  // in the decrypt-only prefix after a rotation — that is the intended
  // migration path for data encrypted before the fix, and it cannot affect
  // newly written ciphertext. The active key is what must be real.
  const active = keys[keys.length - 1];
  if (
    process.env.NODE_ENV !== 'test' &&
    (active === DEFAULT_ENCRYPTION_KEY ||
      active.startsWith('your-') ||
      active === 'change_me')
  ) {
    throw new Error(
      'The ACTIVE ENCRYPTION_KEYS entry (the last one) still holds a placeholder ' +
        'or the former hard-coded default. Append a freshly generated key to rotate, ' +
        'e.g. `openssl rand -base64 32`, so new data is encrypted with a secret that ' +
        'is not published in this repository. Existing ciphertext stays readable ' +
        'through the older decrypt-only entries.',
    );
  }

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
    keys = allKeys; // O(1) on match, O(n) fallback — try all keys for backward compat
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
