import { DEFAULT_ENCRYPTION_KEY } from '@/common/constants/app.constants';
import {
  decryptWithDEK,
  unwrapDEK,
} from '@/common/utils/workspace-encryption.util';
import { EncryptionUpgradeService } from '@/services/workspace-encryption/encryption-upgrade.service';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import type { DataSource } from 'typeorm';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import {
  cleanupE2eData,
  createUser,
  createWorkspace,
} from './helpers/workspace';

/** The pre-v2 write path: AES-256-CBC, `<index>:<iv>:<data>` for a KEK */
const legacyCbc = (key: Buffer, plain: Buffer) => {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return `${iv.toString('hex')}:${data.toString('hex')}`;
};
const kekOf = (raw: string) => createHash('sha256').update(raw).digest();

/**
 * A deployment that ran without ENCRYPTION_KEYS (data under the built-in
 * default key) and in the pre-v2 formats, then gets a real key: the boot
 * upgrade must keep every secret readable and move it to the new key.
 */
describe('Encryption upgrade (e2e)', () => {
  jest.setTimeout(60_000);

  const originalKeys = process.env.ENCRYPTION_KEYS;
  const NEW_KEY = 'e2e-new-key-0123456789abcdef0123456789';
  let app: TestApp;
  let dataSource: DataSource;
  let upgrade: EncryptionUpgradeService;
  let workspaceId: string;
  let userId: string;
  let configId: string;
  let dek: Buffer;
  const unreadable = legacyCbc(
    kekOf('a-key-nobody-has-0123456789abcdef'),
    Buffer.from('lost'),
  );

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.dataSource;
    upgrade = app.app.get(EncryptionUpgradeService);

    const user = await createUser(app.server, { name: 'E2E Crypto' });
    userId = user.userId;
    workspaceId = (
      await createWorkspace(app.server, user, `e2e-crypto-${Date.now()}`)
    ).id;

    // Rewind the workspace to an old deployment: DEK wrapped by the default key
    const [{ dek: wrapped }] = await dataSource.query<{ dek: string }[]>(
      'SELECT dek FROM workspaces WHERE id = $1',
      [workspaceId],
    );
    dek = unwrapDEK(wrapped);
    await dataSource.query('UPDATE workspaces SET dek = $1 WHERE id = $2', [
      `0:${legacyCbc(kekOf(DEFAULT_ENCRYPTION_KEY), dek)}`,
      workspaceId,
    ]);

    const [{ id }] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO agent_configs ("workspaceId", "userId", "searchProviders")
       VALUES ($1, $2, $3::jsonb) RETURNING id`,
      [
        workspaceId,
        userId,
        JSON.stringify([
          {
            provider: 'tavily',
            apiKey: legacyCbc(dek, Buffer.from('tavily-key')),
            isDefault: true,
          },
          { provider: 'brave', apiKey: unreadable, isDefault: false },
          { provider: 'exa', apiKey: 'plain-key', isDefault: false },
        ]),
      ],
    );
    configId = id;

    process.env.ENCRYPTION_KEYS = NEW_KEY;
  });

  afterAll(async () => {
    // Move every secret the upgrades touched back to the suite's key, so the
    // specs that run after this one can still read them
    process.env.ENCRYPTION_KEYS = `${NEW_KEY},${originalKeys ?? DEFAULT_ENCRYPTION_KEY}`;
    await upgrade.upgrade();
    if (originalKeys === undefined) delete process.env.ENCRYPTION_KEYS;
    else process.env.ENCRYPTION_KEYS = originalKeys;
    await cleanupE2eData(dataSource, {
      workspaceIds: [workspaceId],
      userIds: [userId],
    });
    await closeTestApp(app.app);
  });

  it('moves old secrets to the new key and keeps them readable', async () => {
    const counts = await upgrade.upgrade();

    expect(counts?.rewrapped).toBeGreaterThanOrEqual(1);
    expect(counts?.reencrypted).toBeGreaterThanOrEqual(1);
    expect(counts?.unreadable).toBeGreaterThanOrEqual(1);

    const [{ dek: rewrapped }] = await dataSource.query<{ dek: string }[]>(
      'SELECT dek FROM workspaces WHERE id = $1',
      [workspaceId],
    );
    expect(rewrapped).toMatch(/^v2:[0-9a-f]{16}:/);
    expect(unwrapDEK(rewrapped).equals(dek)).toBe(true);

    const [{ searchProviders }] = await dataSource.query<
      { searchProviders: { apiKey: string }[] }[]
    >('SELECT "searchProviders" FROM agent_configs WHERE id = $1', [configId]);
    const [tavily, brave, exa] = searchProviders;
    expect(tavily.apiKey).toMatch(/^v2:dek:/);
    expect(decryptWithDEK(tavily.apiKey, dek)).toBe('tavily-key');
    // Neither a ciphertext no key opens nor a plain value is ever rewritten
    expect(brave.apiKey).toBe(unreadable);
    expect(exa.apiKey).toBe('plain-key');
  });

  it('has nothing left to do on the next boot', async () => {
    const counts = await upgrade.upgrade();

    expect(counts).toMatchObject({ rewrapped: 0, reencrypted: 0 });
  });
});
