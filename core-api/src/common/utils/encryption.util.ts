import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { isLocalEnv } from '../config/runtime-env';
import { DEFAULT_ENCRYPTION_KEY } from '../constants/app.constants';

/*
 * Every stored ciphertext says how to decrypt it:
 * - `v2:<keyId>:<iv>:<tag>:<data>`: AES-256-GCM under the KEK whose id is
 *   <keyId>. Authenticated, so a wrong key fails instead of returning garbage.
 * - `<index>:<iv>:<data>`: AES-256-CBC under ENCRYPTION_KEYS[index] (v1).
 * - `<iv>:<data>`: AES-256-CBC under an unknown KEK (before key indexes).
 * Workspace data encrypted with its DEK is `v2:dek:...` (workspace-encryption.util).
 * Only v2 is written; the CBC formats stay readable.
 */

const GCM_IV_LENGTH = 12;
const MIN_ACTIVE_KEY_LENGTH = 32;

/** Shipped as defaults or examples; never fit to protect real data */
const KNOWN_WEAK_KEYS = new Set([
  DEFAULT_ENCRYPTION_KEY,
  'super_secret_key',
  'your-encryption-key-change-in-production',
  'change_me',
]);

export interface Kek {
  /** Stored in v2 ciphertexts to find the key again, wherever it sits */
  id: string;
  key: Buffer;
}

export type Ciphertext =
  | { kind: 'v2'; keyId: string; iv: string; tag: string; data: string }
  | { kind: 'v1'; index: number; iv: string; data: string }
  | { kind: 'legacy'; iv: string; data: string };

const toKek = (raw: string): Kek => {
  const key = createHash('sha256').update(raw).digest();
  const id = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return { id, key };
};

const configuredKeys = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

let cachedRing: { raw: string | undefined; keys: Kek[]; ring: Kek[] } | null =
  null;

/**
 * KEKs from ENCRYPTION_KEYS in order, the last one encrypting; without any,
 * the built-in default. The ring adds that default as a decrypt-only key:
 * deployments that ran without ENCRYPTION_KEYS stored data under it, and
 * setting a key must keep that data readable.
 */
function keyRing(): { keys: Kek[]; ring: Kek[] } {
  const raw = process.env.ENCRYPTION_KEYS;
  if (cachedRing && cachedRing.raw === raw) return cachedRing;

  const configured = configuredKeys(raw);
  const keys = (configured.length ? configured : [DEFAULT_ENCRYPTION_KEY]).map(
    toKek,
  );
  const fallback = toKek(DEFAULT_ENCRYPTION_KEY);
  const ring = keys.some((kek) => kek.id === fallback.id)
    ? keys
    : [...keys, fallback];
  cachedRing = { raw, keys, ring };
  return cachedRing;
}

/** The KEK new data is encrypted with: the last one in ENCRYPTION_KEYS */
export function getActiveKek(): Kek {
  const { keys } = keyRing();
  return keys[keys.length - 1];
}

/**
 * Deployed, the key that encrypts (the last in ENCRYPTION_KEYS) must be 32+
 * characters and not a default or example value, or the API refuses to boot.
 * Earlier keys only decrypt, whatever they are. Locally an unset
 * ENCRYPTION_KEYS falls back to the built-in default.
 */
export function assertEncryptionKeys(env: NodeJS.ProcessEnv = process.env) {
  if (isLocalEnv(env)) return;
  const active = configuredKeys(env.ENCRYPTION_KEYS).at(-1);
  if (
    !active ||
    active.length < MIN_ACTIVE_KEY_LENGTH ||
    KNOWN_WEAK_KEYS.has(active)
  ) {
    throw new Error(
      `ENCRYPTION_KEYS must end with a random key of at least ${MIN_ACTIVE_KEY_LENGTH} characters (e.g. \`openssl rand -base64 32\`); it encrypts stored credentials. Add the new key after the current ones: data encrypted under them, or under the built-in default, stays readable.`,
    );
  }
}

const isHex = (value: string, length?: number) =>
  /^[0-9a-f]+$/i.test(value) &&
  (length === undefined || value.length === length);

/** A CBC body is whole 16-byte blocks */
const isCbcData = (value: string) => isHex(value) && value.length % 32 === 0;

/** Reads a stored ciphertext's format; null when the value is not one */
export function parseCiphertext(value: string): Ciphertext | null {
  const parts = value.split(':');
  if (parts.length === 5 && parts[0] === 'v2') {
    const [, keyId, iv, tag, data] = parts;
    // GCM data may be empty: an empty secret encrypts to no bytes
    if (
      isHex(iv, GCM_IV_LENGTH * 2) &&
      isHex(tag, 32) &&
      /^[0-9a-f]*$/i.test(data)
    ) {
      return { kind: 'v2', keyId, iv, tag, data };
    }
    return null;
  }
  if (parts.length === 3 && /^\d+$/.test(parts[0])) {
    const [index, iv, data] = parts;
    if (isHex(iv, 32) && isCbcData(data)) {
      return { kind: 'v1', index: Number(index), iv, data };
    }
    return null;
  }
  if (parts.length === 2 && isHex(parts[0], 32) && isCbcData(parts[1])) {
    return { kind: 'legacy', iv: parts[0], data: parts[1] };
  }
  return null;
}

/** AES-256-GCM; returns `<iv>:<tag>:<data>` */
export function gcmSeal(key: Buffer, plain: Buffer): string {
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${data.toString('hex')}`;
}

/** Throws when the key is wrong or the data was altered */
export function gcmOpen(
  key: Buffer,
  { iv, tag, data }: { iv: string; tag: string; data: string },
): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]);
}

/**
 * AES-256-CBC; null on a padding error. CBC is unauthenticated: about 1 in 256
 * wrong keys still pass the padding check, so callers must also check the
 * plaintext's shape.
 */
export function cbcOpen(key: Buffer, iv: string, data: string): Buffer | null {
  try {
    const decipher = createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(iv, 'hex'),
    );
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'hex')),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** Text secrets are valid UTF-8; CBC garbage from a wrong key almost never is */
export const isUtf8 = (bytes: Buffer): boolean => {
  try {
    utf8.decode(bytes);
    return true;
  } catch {
    return false;
  }
};

/** Encrypts bytes with the active KEK as `v2:<keyId>:...` */
export function encryptBytesWithKek(plain: Buffer): string {
  const { id, key } = getActiveKek();
  return `v2:${id}:${gcmSeal(key, plain)}`;
}

/**
 * Decrypts a KEK ciphertext of any format. CBC tries the key at the stored
 * index first, then every other key in the ring, and keeps only a plaintext
 * that `accept` recognizes.
 */
export function decryptBytesWithKek(
  value: string,
  accept: (plain: Buffer) => boolean,
): Buffer {
  const parsed = parseCiphertext(value);
  if (!parsed) throw new Error('Not an encrypted value');
  const { keys, ring } = keyRing();

  if (parsed.kind === 'v2') {
    const kek = ring.find((candidate) => candidate.id === parsed.keyId);
    if (!kek) {
      throw new Error(
        `No key in ENCRYPTION_KEYS matches key id ${parsed.keyId}`,
      );
    }
    return gcmOpen(kek.key, parsed);
  }

  const indexed = parsed.kind === 'v1' ? keys[parsed.index] : undefined;
  const candidates = indexed
    ? [indexed, ...ring.filter((kek) => kek !== indexed)]
    : ring;
  for (const { key } of candidates) {
    const plain = cbcOpen(key, parsed.iv, parsed.data);
    if (plain && accept(plain)) return plain;
  }
  throw new Error(
    `Decryption failed with every key in ENCRYPTION_KEYS (${ring.length} tried)`,
  );
}

/** Whether a KEK ciphertext already uses the format and key new data gets */
export const isEncryptedWithActiveKek = (value: string): boolean =>
  value.startsWith(`v2:${getActiveKek().id}:`);

/**
 * Encrypt text with the active KEK.
 *
 * @deprecated For workspace-scoped data, use encryptWithDEK instead.
 */
export function encrypt(text: string): string {
  return encryptBytesWithKek(Buffer.from(text, 'utf8'));
}

/**
 * Decrypt text encrypted with a KEK, in any stored format.
 *
 * @deprecated For workspace-scoped data, use decryptWithDEK instead.
 */
export function decrypt(encryptedText: string): string {
  return decryptBytesWithKek(encryptedText, isUtf8).toString('utf8');
}
