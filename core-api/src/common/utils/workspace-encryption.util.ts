import { randomBytes } from 'crypto';
import {
  cbcOpen,
  decrypt,
  decryptBytesWithKek,
  encryptBytesWithKek,
  gcmOpen,
  gcmSeal,
  isEncryptedWithActiveKek,
  isUtf8,
  parseCiphertext,
} from './encryption.util';

const DEK_LENGTH = 32; // 256 bits for AES-256
/** Key id of v2 data encrypted with the workspace DEK rather than a KEK */
const DEK_KEY_ID = 'dek';

/**
 * Generate a random 32-byte Data Encryption Key (DEK).
 * Each workspace gets its own DEK.
 */
export function generateDEK(): Buffer {
  return randomBytes(DEK_LENGTH);
}

/**
 * Wrap (encrypt) a DEK with the active KEK, for storage in workspaces.dek.
 * The `v2:<keyId>:` prefix finds the KEK again after keys are added or
 * removed, so a rotation never loses the DEK.
 */
export function wrapDEK(dek: Buffer): string {
  return encryptBytesWithKek(dek);
}

/**
 * Unwrap (decrypt) a wrapped DEK of any stored format. A legacy CBC unwrap
 * only counts when it yields exactly 32 bytes, which a wrong key never does.
 */
export function unwrapDEK(wrappedDEK: string): Buffer {
  return decryptBytesWithKek(wrappedDEK, (dek) => dek.length === DEK_LENGTH);
}

/**
 * Encrypt data using a workspace-specific DEK.
 * Format: `v2:dek:<iv>:<tag>:<data>` (AES-256-GCM).
 */
export function encryptWithDEK(text: string, dek: Buffer): string {
  return `v2:${DEK_KEY_ID}:${gcmSeal(dek, Buffer.from(text, 'utf8'))}`;
}

/**
 * Decrypt workspace data in any stored format: v2 under the DEK, legacy CBC
 * under the DEK, or anything encrypted with a KEK (pre-envelope data).
 *
 * @param encryptedText - Stored ciphertext
 * @param dek - Cleartext DEK, or null for pre-envelope-encryption workspaces
 */
export function decryptWithDEK(
  encryptedText: string,
  dek: Buffer | null,
): string {
  const parsed = parseCiphertext(encryptedText);
  if (!parsed) throw new Error('Invalid encrypted data format');

  if (parsed.kind === 'v2' && parsed.keyId === DEK_KEY_ID) {
    if (!dek) throw new Error('Workspace has no DEK to decrypt with');
    return gcmOpen(dek, parsed).toString('utf8');
  }

  // Legacy DEK data shares the unprefixed CBC format with old KEK data
  if (parsed.kind === 'legacy' && dek) {
    const plain = cbcOpen(dek, parsed.iv, parsed.data);
    if (plain && isUtf8(plain)) return plain.toString('utf8');
  }

  return decrypt(encryptedText);
}

/**
 * Whether a stored ciphertext predates the current format: everything is
 * rewritten as v2 under the DEK, or under the active KEK for a workspace
 * without one. Plain (unencrypted) values are not ciphertexts and never need it.
 */
export function needsReencryption(value: string, dek: Buffer | null): boolean {
  if (!parseCiphertext(value)) return false;
  return dek
    ? !value.startsWith(`v2:${DEK_KEY_ID}:`)
    : !isEncryptedWithActiveKek(value);
}
