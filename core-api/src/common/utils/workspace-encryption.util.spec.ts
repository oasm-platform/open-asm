import { createCipheriv, createHash, randomBytes } from 'crypto';
import { encrypt } from './encryption.util';
import {
  decryptWithDEK,
  encryptWithDEK,
  generateDEK,
  needsReencryption,
  unwrapDEK,
  wrapDEK,
} from './workspace-encryption.util';

const KEY_A = 'test-key-a-0123456789abcdef0123456789';
const KEY_B = 'test-key-b-0123456789abcdef0123456789';
const KEY_C = 'test-key-c-0123456789abcdef0123456789';
const DEK = Buffer.from(
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  'hex',
);

/** Written by the pre-v2 implementation (main @ 4ca4b331), with DEK above */
const LEGACY = {
  /** ENCRYPTION_KEYS=A,B */
  wrappedDekIndexOne:
    '1:98a79a91505dd9bcb2b85dad560269df:c3afd692b4c64bdecff5c19adae9298f236ebaa50875b932ba591d7989c30075b1de06a0c771f06eca458f6e70b718ba',
  /** ENCRYPTION_KEYS unset: the built-in default key */
  wrappedDekDefault:
    '0:bfcea2b5738109bf4c4bed606437580e:3d21bf876123177e9f78dff4c2d529e082e9a96901c8890d2091840a01d84942c3d07563dcda7bb452648f1eb1fc1b9b',
  /** "workspace-token", AES-CBC under the DEK */
  dekData: '4c0a02b431f34b628b187cda30c6cc4d:00ad8a37d9fa3f546062738101964c2f',
};

describe('workspace-encryption.util', () => {
  const original = process.env.ENCRYPTION_KEYS;
  const useKeys = (...keys: string[]) => {
    process.env.ENCRYPTION_KEYS = keys.join(',');
  };

  afterEach(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEYS;
    else process.env.ENCRYPTION_KEYS = original;
  });

  describe('DEKs wrapped before v2', () => {
    it('unwraps after rotation, including once the earlier key is removed', () => {
      for (const keys of [
        [KEY_A, KEY_B],
        [KEY_A, KEY_B, KEY_C],
        [KEY_B, KEY_C],
      ]) {
        useKeys(...keys);
        expect(unwrapDEK(LEGACY.wrappedDekIndexOne).equals(DEK)).toBe(true);
      }
    });

    it('unwraps a DEK wrapped without ENCRYPTION_KEYS once a real key is set', () => {
      useKeys(KEY_C);
      expect(unwrapDEK(LEGACY.wrappedDekDefault).equals(DEK)).toBe(true);
    });

    it('never returns another DEK after a rotation', () => {
      // The pre-v2 reader handed ~0.4% of workspaces a wrong DEK here
      useKeys(KEY_A, KEY_B);
      const key = createHash('sha256').update(KEY_B).digest();
      const mismatches = Array.from({ length: 2000 }, () => {
        const dek = generateDEK();
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-cbc', key, iv);
        const data = Buffer.concat([cipher.update(dek), cipher.final()]);
        const wrapped = `1:${iv.toString('hex')}:${data.toString('hex')}`;
        return unwrapDEK(wrapped).equals(dek);
      }).filter((ok) => !ok);
      expect(mismatches).toHaveLength(0);
    });

    it('reads workspace data encrypted with the DEK before v2', () => {
      useKeys(KEY_C);
      expect(decryptWithDEK(LEGACY.dekData, DEK)).toBe('workspace-token');
    });
  });

  describe('v2', () => {
    it('wraps a DEK under the active key and unwraps it after rotation', () => {
      useKeys(KEY_A);
      const wrapped = wrapDEK(DEK);

      expect(wrapped).toMatch(/^v2:[0-9a-f]{16}:/);
      useKeys(KEY_A, KEY_C);
      expect(unwrapDEK(wrapped).equals(DEK)).toBe(true);
    });

    it('encrypts workspace data as AES-GCM under the DEK', () => {
      const value = encryptWithDEK('token', DEK);

      expect(value).toMatch(/^v2:dek:/);
      expect(decryptWithDEK(value, DEK)).toBe('token');
      expect(() => decryptWithDEK(value, generateDEK())).toThrow();
      expect(() => decryptWithDEK(value, null)).toThrow(/no DEK/);
    });

    it('reads data encrypted with a KEK for a workspace that had no DEK', () => {
      useKeys(KEY_A);
      expect(decryptWithDEK(encrypt('pre-envelope'), DEK)).toBe('pre-envelope');
    });
  });

  describe('needsReencryption', () => {
    beforeEach(() => useKeys(KEY_A));

    it('flags every older format', () => {
      expect(needsReencryption(LEGACY.dekData, DEK)).toBe(true);
      expect(needsReencryption(encrypt('kek'), DEK)).toBe(true);
      expect(needsReencryption(LEGACY.wrappedDekIndexOne, null)).toBe(true);
    });

    it('leaves current ciphertext and plain values alone', () => {
      expect(needsReencryption(encryptWithDEK('x', DEK), DEK)).toBe(false);
      expect(needsReencryption(encrypt('x'), null)).toBe(false);
      expect(needsReencryption('plain-value', DEK)).toBe(false);
    });

    it('flags KEK data once the key rotates', () => {
      const value = encrypt('x');
      useKeys(KEY_A, KEY_C);
      expect(needsReencryption(value, null)).toBe(true);
    });
  });
});
