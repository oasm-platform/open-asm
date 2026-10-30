import { createCipheriv, createHash, randomBytes } from 'crypto';
import {
  assertEncryptionKeys,
  decrypt,
  encrypt,
  isEncryptedWithActiveKek,
  parseCiphertext,
} from './encryption.util';

const KEY_A = 'test-key-a-0123456789abcdef0123456789';
const KEY_B = 'test-key-b-0123456789abcdef0123456789';
const KEY_C = 'test-key-c-0123456789abcdef0123456789';

/**
 * Written by the pre-v2 implementation (main @ 4ca4b331) under the keys named,
 * so reading them proves stored data survives the upgrade.
 */
const LEGACY = {
  /** ENCRYPTION_KEYS=A: "alpha-secret" */
  v1IndexZero:
    '0:83ac55cb24549a68b889017f50d7329d:b5f6c5b760db8624c7a77f8b427581c1',
  /** Same ciphertext in the layout from before key indexes */
  unprefixed:
    '83ac55cb24549a68b889017f50d7329d:b5f6c5b760db8624c7a77f8b427581c1',
  /** ENCRYPTION_KEYS=A,B: "beta-secret" */
  v1IndexOne:
    '1:aaca6092cfd8916b32838c345b375afc:9e1901b632e937e49552bf2b9da5bfcf',
  /** ENCRYPTION_KEYS unset, so the built-in default key: "gamma-secret" */
  defaultKey:
    '0:7472865cf19da57693b332ad6a405837:bb2430d2c5e4bc780f4215272c57d68c',
};

/** The pre-v2 write path: AES-256-CBC as `<index>:<iv>:<data>` */
const legacyEncrypt = (index: number, rawKey: string, text: string) => {
  const key = createHash('sha256').update(rawKey).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${index}:${iv.toString('hex')}:${data.toString('hex')}`;
};

describe('encryption.util', () => {
  const original = process.env.ENCRYPTION_KEYS;
  const useKeys = (...keys: string[]) => {
    process.env.ENCRYPTION_KEYS = keys.join(',');
  };

  afterEach(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEYS;
    else process.env.ENCRYPTION_KEYS = original;
  });

  describe('data stored before v2', () => {
    it('reads a v1 ciphertext under its key, after a new key is added and after keys move', () => {
      for (const keys of [[KEY_A], [KEY_A, KEY_C], [KEY_C, KEY_A]]) {
        useKeys(...keys);
        expect(decrypt(LEGACY.v1IndexZero)).toBe('alpha-secret');
      }
    });

    it('reads a v1 ciphertext once the keys before it are removed', () => {
      useKeys(KEY_B);
      expect(decrypt(LEGACY.v1IndexOne)).toBe('beta-secret');
      useKeys(KEY_A, KEY_B, KEY_C);
      expect(decrypt(LEGACY.v1IndexOne)).toBe('beta-secret');
    });

    it('reads data stored without ENCRYPTION_KEYS once a real key is set', () => {
      useKeys(KEY_C);
      expect(decrypt(LEGACY.defaultKey)).toBe('gamma-secret');
    });

    it('reads the layout from before key indexes', () => {
      useKeys(KEY_C, KEY_A);
      expect(decrypt(LEGACY.unprefixed)).toBe('alpha-secret');
    });

    it('never returns another plaintext after a rotation', () => {
      // The pre-v2 reader tried key 0 first and returned garbage for ~0.4% of these
      useKeys(KEY_A, KEY_B);
      const secrets = Array.from({ length: 2000 }, () =>
        randomBytes(18).toString('base64'),
      );
      const wrong = secrets.filter(
        (secret) => decrypt(legacyEncrypt(1, KEY_B, secret)) !== secret,
      );
      expect(wrong).toEqual([]);
    });
  });

  describe('v2', () => {
    it('writes AES-GCM under the active key and reads it back', () => {
      useKeys(KEY_A, KEY_B);
      const value = encrypt('s3cret');

      expect(value).toMatch(/^v2:[0-9a-f]{16}:/);
      expect(isEncryptedWithActiveKek(value)).toBe(true);
      expect(decrypt(value)).toBe('s3cret');
    });

    it('finds its key by id after rotation, wherever the key sits', () => {
      useKeys(KEY_A);
      const value = encrypt('s3cret');

      useKeys(KEY_A, KEY_C);
      expect(isEncryptedWithActiveKek(value)).toBe(false);
      expect(decrypt(value)).toBe('s3cret');
      useKeys(KEY_C, KEY_A);
      expect(decrypt(value)).toBe('s3cret');
    });

    it('fails loudly once its key is gone instead of returning garbage', () => {
      useKeys(KEY_A);
      const value = encrypt('s3cret');

      useKeys(KEY_C);
      expect(() => decrypt(value)).toThrow(/No key in ENCRYPTION_KEYS matches/);
    });

    it('rejects altered data', () => {
      useKeys(KEY_A);
      const value = encrypt('s3cret');
      const tampered = value.slice(0, -2) + (value.endsWith('0') ? '1' : '0');

      expect(() => decrypt(tampered)).toThrow();
    });

    it('round-trips an empty secret', () => {
      useKeys(KEY_A);
      expect(decrypt(encrypt(''))).toBe('');
    });
  });

  describe('parseCiphertext', () => {
    it('does not take ordinary strings for ciphertext', () => {
      for (const value of ['', 'plain-api-key', 'host:443', 'abc:def:ghi']) {
        expect(parseCiphertext(value)).toBeNull();
      }
    });
  });

  describe('assertEncryptionKeys', () => {
    const strong = 'f3Jq9vX2mR7tL0pK8sW4nB6yH1cD5eZaU+oQ=';

    it('lets local development and tests run on the built-in default', () => {
      expect(() =>
        assertEncryptionKeys({ NODE_ENV: 'development' }),
      ).not.toThrow();
      expect(() => assertEncryptionKeys({ NODE_ENV: 'test' })).not.toThrow();
    });

    it.each([
      ['unset', undefined],
      ['too short', 'short-key'],
      ['the example value', 'super_secret_key'],
      [
        'the example value last',
        `${strong},your-encryption-key-change-in-production`,
      ],
    ])('refuses to boot when deployed with a key %s', (_, ENCRYPTION_KEYS) => {
      expect(() => assertEncryptionKeys({ ENCRYPTION_KEYS })).toThrow(
        /ENCRYPTION_KEYS must end with a random key of at least 32 characters/,
      );
    });

    it('accepts a strong active key after weaker older ones', () => {
      expect(() =>
        assertEncryptionKeys({
          ENCRYPTION_KEYS: `super_secret_key, ${strong}`,
        }),
      ).not.toThrow();
    });
  });
});
