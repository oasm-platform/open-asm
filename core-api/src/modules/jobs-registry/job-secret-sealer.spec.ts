import {
  Aes256Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
} from '@hpke/core';
import {
  JOB_SECRETS_INFO,
  isValidEncryptionPublicKey,
  sealJobSecrets,
} from './job-secret-sealer';

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});

const workerKeyPair = async () => {
  const keyPair = await suite.kem.generateKeyPair();
  const publicKey = Buffer.from(
    await suite.kem.serializePublicKey(keyPair.publicKey),
  );
  return { keyPair, publicKey };
};

const open = async (
  privateKey: CryptoKey,
  sealed: { enc: Buffer; ciphertext: Buffer },
  aad: string,
) => {
  const recipient = await suite.createRecipientContext({
    recipientKey: privateKey,
    enc: sealed.enc,
    info: new TextEncoder().encode(JOB_SECRETS_INFO),
  });
  const plain = await recipient.open(
    sealed.ciphertext,
    new TextEncoder().encode(aad),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as unknown;
};

describe('sealJobSecrets', () => {
  const payload = { config: { apiKey: 'k' }, inputs: { token: 't' } };

  it('seals the payload so only the worker key opens it, bound to the job and the worker', async () => {
    const { keyPair, publicKey } = await workerKeyPair();

    const sealed = await sealJobSecrets(publicKey, payload, 'job-1', 'worker-1');

    expect(sealed.alg).toBe('DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM');
    expect(sealed.ciphertext.toString()).not.toContain('apiKey');
    expect(await open(keyPair.privateKey, sealed, 'job-1|worker-1')).toEqual(payload);
    // The AAD binds it: it opens for no other job.
    await expect(open(keyPair.privateKey, sealed, 'job-2|worker-1')).rejects.toThrow();
  });

  it('fails for a key that is not a P-256 public key', async () => {
    await expect(
      sealJobSecrets(Buffer.from('not-a-key'), payload, 'job-1', 'worker-1'),
    ).rejects.toThrow();
  });
});

describe('isValidEncryptionPublicKey', () => {
  it('accepts an uncompressed P-256 point and rejects anything else', async () => {
    const { publicKey } = await workerKeyPair();

    expect(await isValidEncryptionPublicKey(publicKey)).toBe(true);
    expect(await isValidEncryptionPublicKey(Buffer.alloc(65))).toBe(false);
    expect(await isValidEncryptionPublicKey(Buffer.from('short'))).toBe(false);
  });
});
