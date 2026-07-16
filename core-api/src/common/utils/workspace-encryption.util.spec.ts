import { createHash, randomBytes, createCipheriv } from 'crypto';
import {
  generateDEK,
  wrapDEK,
  unwrapDEK,
  encryptWithDEK,
  decryptWithDEK,
} from './workspace-encryption.util';

// Helper: manually encrypt with DEFAULT key in OLD format (no prefix)
function encryptLegacy(text: string): string {
  const key = createHash('sha256')
    .update('OASM_DEFAULT_ENCRYPTION_KEY')
    .digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

describe('generateDEK', () => {
  it('should generate a 32-byte buffer', () => {
    const dek = generateDEK();
    expect(Buffer.isBuffer(dek)).toBe(true);
    expect(dek.length).toBe(32);
  });

  it('should generate unique keys each call', () => {
    const dek1 = generateDEK();
    const dek2 = generateDEK();
    expect(dek1.equals(dek2)).toBe(false);
  });
});

describe('wrapDEK / unwrapDEK', () => {
  it('should roundtrip: wrap then unwrap produces original DEK', () => {
    const dek = generateDEK();
    const wrapped = wrapDEK(dek);
    expect(typeof wrapped).toBe('string');
    expect(wrapped).toContain(':');

    // Should have numeric index prefix
    const firstColon = wrapped.indexOf(':');
    const indexStr = wrapped.substring(0, firstColon);
    expect(/^\d+$/.test(indexStr)).toBe(true);

    const unwrapped = unwrapDEK(wrapped);
    expect(Buffer.isBuffer(unwrapped)).toBe(true);
    expect(dek.equals(unwrapped)).toBe(true);
  });

  it('should fail unwrap on corrupted data', () => {
    expect(() => unwrapDEK('0:bad:data')).toThrow();
  });

  it('should fail unwrap on invalid key index', () => {
    expect(() => unwrapDEK('99:abc:def')).toThrow(/key index/);
  });
});

describe('encryptWithDEK / decryptWithDEK', () => {
  const sampleText = 'Hello, World! Đây là dữ liệu cần mã hóa.';

  it('should roundtrip with valid DEK', () => {
    const dek = generateDEK();
    const encrypted = encryptWithDEK(sampleText, dek);
    expect(encrypted).not.toBe(sampleText);
    expect(encrypted).toContain(':');

    const decrypted = decryptWithDEK(encrypted, dek);
    expect(decrypted).toBe(sampleText);
  });

  it('should handle empty string', () => {
    const dek = generateDEK();
    const encrypted = encryptWithDEK('', dek);
    expect(decryptWithDEK(encrypted, dek)).toBe('');
  });

  it('should handle UTF-8 characters', () => {
    const dek = generateDEK();
    const text = 'こんにちは世界 🌍';
    const encrypted = encryptWithDEK(text, dek);
    expect(decryptWithDEK(encrypted, dek)).toBe(text);
  });

  it('should fail decrypt with wrong DEK', () => {
    const dek1 = generateDEK();
    const dek2 = generateDEK();
    const encrypted = encryptWithDEK(sampleText, dek1);
    expect(() => decryptWithDEK(encrypted, dek2)).toThrow();
  });
});

describe('backward compatibility — decryptWithDEK with legacy KEK data', () => {
  const sampleText = 'Hello, World! Đây là dữ liệu cần mã hóa.';

  it('should decrypt legacy KEK data (no prefix) when DEK is null', () => {
    const legacyEncrypted = encryptLegacy(sampleText);
    // Legacy format: no numeric prefix
    expect(legacyEncrypted.split(':')[0]).not.toMatch(/^\d+$/);

    const result = decryptWithDEK(legacyEncrypted, null);
    expect(result).toBe(sampleText);
  });

  it('should fall back to KEK when DEK decryption fails', () => {
    const legacyEncrypted = encryptLegacy(sampleText);
    const dek = generateDEK();
    const result = decryptWithDEK(legacyEncrypted, dek);
    expect(result).toBe(sampleText);
  });
});

describe('end-to-end envelope encryption flow', () => {
  const sampleText = 'Full lifecycle test.';

  it('should simulate the full workspace encryption lifecycle', () => {
    // 1. Generate DEK
    const dek = generateDEK();
    // 2. Wrap DEK with KEK (what gets stored in workspace.dek)
    const wrappedDEK = wrapDEK(dek);
    // 3. Store wrappedDEK in DB (simulated)
    const storedWrappedDEK = wrappedDEK;
    // 4. Later: unwrap DEK from stored value
    const unwrappedDEK = unwrapDEK(storedWrappedDEK);
    expect(dek.equals(unwrappedDEK)).toBe(true);
    // 5. Encrypt data with DEK (no prefix — DEK is the key)
    const encrypted = encryptWithDEK(sampleText, unwrappedDEK);
    // 6. Decrypt data with DEK
    const decrypted = decryptWithDEK(encrypted, unwrappedDEK);
    expect(decrypted).toBe(sampleText);
    // 7. Different workspace DEK cannot decrypt
    const otherDEK = generateDEK();
    expect(() => decryptWithDEK(encrypted, otherDEK)).toThrow();
  });
});
