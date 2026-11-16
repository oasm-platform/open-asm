import {
  Aes256Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
} from '@hpke/core';

/** HPKE application info; the worker opens with the same string. */
export const JOB_SECRETS_INFO = 'oasm job secrets v1';

const ALG = 'DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM';

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});

const utf8 = (text: string) => new TextEncoder().encode(text);

export interface SealedSecrets {
  alg: string;
  enc: Buffer;
  ciphertext: Buffer;
}

/** Whether `key` is an HPKE public key the worker could hold the private half of. */
export async function isValidEncryptionPublicKey(key: Buffer): Promise<boolean> {
  try {
    await suite.kem.deserializePublicKey(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Seals a job's secrets to the worker's encryption key (HPKE base mode,
 * RFC 9180). The AAD is "<job id>|<worker id>", so the blob opens for no
 * other job or worker; a proxy or log in between sees only ciphertext.
 */
export async function sealJobSecrets(
  workerPublicKey: Buffer,
  payload: Record<string, unknown>,
  jobId: string,
  workerId: string,
): Promise<SealedSecrets> {
  const sender = await suite.createSenderContext({
    recipientPublicKey: await suite.kem.deserializePublicKey(workerPublicKey),
    info: utf8(JOB_SECRETS_INFO),
  });
  const ciphertext = await sender.seal(
    utf8(JSON.stringify(payload)),
    utf8(`${jobId}|${workerId}`),
  );
  return {
    alg: ALG,
    enc: Buffer.from(sender.enc),
    ciphertext: Buffer.from(ciphertext),
  };
}
