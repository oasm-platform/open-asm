import { createHash, randomUUID } from 'node:crypto';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { StorageService } from '../src/modules/storage/storage.service';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import {
  cleanupE2eData,
  createUser,
  createWorkspace,
} from './helpers/workspace';

/**
 * Storage presign + public-read matrix, proven against real Postgres + real RustFS.
 *
 * The byte-streaming read route (`GET /api/storage/:bucket/:path`) is gone, so
 * every read flows through `GET /api/storage/presign/download` (`authorizeRead`)
 * or an unsigned direct-to-storage fetch of a helper-emitted plain URL.
 *
 * Bucket classes (`StorageService.getBucketAccess`): `system` is public,
 * `cached-static` needs a session, `screenshot`/`nuclei-templates` need a
 * session AND membership of ANY workspace that owns the object (screenshot keys
 * are `md5(asset.value)` and can collide across workspaces), `reports`/
 * `job-results` are private (403), `default` is blocked (404).
 *
 * Proofs:
 *  1. Presign AE-02 matrix: public/authed-tenant/private/blocked classes incl.
 *     foreign-workspace screenshot -> 403; fetched presigned URLs return the
 *     object bytes with an `image/*` `Content-Type` (never bare statuses).
 *  2. Anonymous public-read over unsigned direct-to-storage fetches: public
 *     object 200 image with correct `Content-Type` (body is the object, not
 *     HTML); tenant 403 anonymous; blocked 403 anonymous; anonymous PUT/DELETE
 *     403 (Get-only policy) with no object created.
 *  3. Flag-off fallback: with `publicReadApplied` cleared, the helper emits a
 *     presigned URL that still loads (200 + bytes).
 *  4. The removed byte route stays gone (404).
 */
describe('Storage presign + public-read matrix (e2e)', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let storage: StorageService;

  const userA = { userId: '', cookie: '' };
  const userB = { userId: '', cookie: '' };
  const userC = { userId: '', cookie: '' };
  let workspaceAId = '';
  let workspaceBId = '';
  let workspaceCId = '';

  /** `screenshot/<key>` owned only by workspace A. */
  let ownedKey = '';
  /** Template id owned only by workspace A; object key is `<id>.yaml`. */
  let templateId = '';
  /** `system` object key, readable without a session. */
  let logoKey = '';
  /** `cached-static` object key, session-only on the presign route. */
  let staticKey = '';
  /** `screenshot/<key>` owned by BOTH workspace A and B (the collision). */
  let collisionKey = '';
  /** Storage origin unsigned fetches go to (RUSTFS_ENDPOINT in e2e). */
  let storageOrigin = '';
  /** Objects written to RustFS, deleted in `afterAll`. */
  const uploaded: Array<{ key: string; bucket: string }> = [];

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const textPayload = 'oasm storage read authz e2e\n';
  const yamlPayload = 'id: e2e-template\ninfo:\n  name: e2e\n';

  async function seedScreenshotChain(
    workspaceId: string,
    hostname: string,
    screenshotPath: string,
  ): Promise<void> {
    const targetId = randomUUID();
    await dataSource.query(
      `INSERT INTO targets (id, value, "workspaceId") VALUES ($1, $2, $3)`,
      [targetId, hostname, workspaceId],
    );
    const assetId = randomUUID();
    await dataSource.query(
      `INSERT INTO assets (id, value, "targetId") VALUES ($1, $2, $3)`,
      [assetId, hostname, targetId],
    );
    await dataSource.query(
      `INSERT INTO asset_services (id, value, port, "assetId", "screenshotPath") VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), hostname, 443, assetId, screenshotPath],
    );
  }

  /** Presigns over the API and fetches the issued URL like a browser would. */
  async function fetchPresigned(
    bucket: string,
    path: string,
    cookie?: string,
  ): Promise<Response> {
    const req = request(server)
      .get('/api/storage/presign/download')
      .query({ bucket, path });
    if (cookie) req.set('Cookie', cookie);
    const res = await req.expect(200);
    const body = res.body as { downloadUrl: string; expiresIn: number };
    expect(body.expiresIn).toBeGreaterThan(0);
    expect(body.downloadUrl).toContain('X-Amz-Signature');
    return fetch(body.downloadUrl);
  }

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;
    storage = app.app.get(StorageService);

    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;

    const a = await createUser(server, { name: 'E2E ReadAuthz A' });
    userA.userId = a.userId;
    userA.cookie = a.cookie;
    workspaceAId = (await createWorkspace(server, a, `e2e-read-authz-a-${stamp}`)).id;

    const b = await createUser(server, { name: 'E2E ReadAuthz B' });
    userB.userId = b.userId;
    userB.cookie = b.cookie;
    workspaceBId = (await createWorkspace(server, b, `e2e-read-authz-b-${stamp}`)).id;

    const c = await createUser(server, { name: 'E2E ReadAuthz C' });
    userC.userId = c.userId;
    userC.cookie = c.cookie;
    workspaceCId = (await createWorkspace(server, c, `e2e-read-authz-c-${stamp}`)).id;

    // Single-owner screenshot: unique md5 key so no other workspace owns it.
    ownedKey = `${createHash('md5').update(`e2e-read-authz-owned-${stamp}`).digest('hex')}.png`;
    await seedScreenshotChain(
      workspaceAId,
      `e2e-read-authz-a-${stamp}.example.com`,
      `screenshot/${ownedKey}`,
    );
    await storage.uploadFile(ownedKey, png, 'screenshot');
    uploaded.push({ key: ownedKey, bucket: 'screenshot' });

    // Workspace-A template; resolver strips the final extension to the id.
    templateId = randomUUID();
    await dataSource.query(
      `INSERT INTO templates (id, "fileName", path, "workspaceId") VALUES ($1, $2, $3, $4)`,
      [
        templateId,
        `e2e-${stamp}.yaml`,
        `nuclei-templates/${templateId}.yaml`,
        workspaceAId,
      ],
    );
    await storage.uploadFile(`${templateId}.yaml`, Buffer.from(yamlPayload, 'utf8'), 'nuclei-templates');
    uploaded.push({ key: `${templateId}.yaml`, bucket: 'nuclei-templates' });

    logoKey = `e2e-logo-${stamp}.png`;
    await storage.uploadFile(logoKey, png, 'system');
    uploaded.push({ key: logoKey, bucket: 'system' });

    staticKey = `e2e-static-${stamp}.txt`;
    await storage.uploadFile(staticKey, Buffer.from(textPayload, 'utf8'), 'cached-static');
    uploaded.push({ key: staticKey, bucket: 'cached-static' });

    // Collision: the SAME screenshotPath row in workspace A and workspace B.
    collisionKey = `${createHash('md5').update('e2e-read-authz-shared-host').digest('hex')}.png`;
    await seedScreenshotChain(
      workspaceAId,
      `e2e-read-authz-shared-${stamp}-a.example.com`,
      `screenshot/${collisionKey}`,
    );
    await seedScreenshotChain(
      workspaceBId,
      `e2e-read-authz-shared-${stamp}-b.example.com`,
      `screenshot/${collisionKey}`,
    );
    await storage.uploadFile(collisionKey, png, 'screenshot');
    uploaded.push({ key: collisionKey, bucket: 'screenshot' });

    // Boot-time verification (`GetBucketPolicyStatus`) is unimplemented on
    // RustFS, so `publicReadApplied` stays empty in-boot even though the
    // `PutBucketPolicy` applied and anonymous reads work (proved by the
    // unsigned fetches below). Mark both public buckets verified-applied so
    // the helper emits plain URLs; the flag-off test clears them again.
    const internals = storage as unknown as {
      publicReadApplied: Set<string>;
    };
    internals.publicReadApplied.add('system');
    internals.publicReadApplied.add('cached-static');

    // Plain helper URL for the public bucket; its origin is the unsigned target.
    const plain = await storage.getClientUrlForPath(`system/${logoKey}`);
    expect(plain.expiresIn).toBeNull();
    storageOrigin = new URL(plain.url).origin;
  });

  afterAll(async () => {
    for (const { key, bucket } of uploaded) {
      await storage.deleteFile(key, bucket);
    }
    await cleanupE2eData(dataSource, {
      workspaceIds: [workspaceAId, workspaceBId, workspaceCId],
      userIds: [userA.userId, userB.userId, userC.userId],
    });
    await closeTestApp(app.app);
  });

  describe('presign AE-02 bucket matrix', () => {
    it('presigns the public system object and the URL loads the png bytes', async () => {
      const fetched = await fetchPresigned('system', logoKey, userA.cookie);
      expect(fetched.status).toBe(200);
      expect(fetched.headers.get('content-type')).toMatch(/image\/png/);
      expect(Buffer.from(await fetched.arrayBuffer()).equals(png)).toBe(true);
    });

    it('rejects anonymous presigns of the public bucket with 401', async () => {
      await request(server)
        .get('/api/storage/presign/download')
        .query({ bucket: 'system', path: logoKey })
        .expect(401);
    });

    it('presigns cached-static for any authenticated user and the URL loads the text', async () => {
      const fetched = await fetchPresigned('cached-static', staticKey, userB.cookie);
      expect(fetched.status).toBe(200);
      expect(fetched.headers.get('content-type')).toMatch(/text\/plain/);
      expect(await fetched.text()).toBe(textPayload);
    });

    it('rejects anonymous presigns of cached-static with 401', async () => {
      await request(server)
        .get('/api/storage/presign/download')
        .query({ bucket: 'cached-static', path: staticKey })
        .expect(401);
    });

    it('lets the owner presign their own screenshot with an image Content-Type', async () => {
      const fetched = await fetchPresigned('screenshot', ownedKey, userA.cookie);
      expect(fetched.status).toBe(200);
      expect(fetched.headers.get('content-type')).toMatch(/image\/png/);
      expect(Buffer.from(await fetched.arrayBuffer()).equals(png)).toBe(true);
    });

    it('rejects a foreign-workspace presign of the screenshot with 403', async () => {
      await request(server)
        .get('/api/storage/presign/download')
        .query({ bucket: 'screenshot', path: ownedKey })
        .set('Cookie', userB.cookie)
        .expect(403);
    });

    it('rejects anonymous presigns of the screenshot with 401', async () => {
      await request(server)
        .get('/api/storage/presign/download')
        .query({ bucket: 'screenshot', path: ownedKey })
        .expect(401);
    });

    it('returns 404 for an authenticated presign of an unowned screenshot key', async () => {
      const unknown = `${createHash('md5').update(`e2e-read-authz-missing-${Date.now()}`).digest('hex')}.png`;
      await request(server)
        .get('/api/storage/presign/download')
        .query({ bucket: 'screenshot', path: unknown })
        .set('Cookie', userA.cookie)
        .expect(404);
    });

    it('lets the owner presign their own template with the yaml bytes', async () => {
      const fetched = await fetchPresigned(
        'nuclei-templates',
        `${templateId}.yaml`,
        userA.cookie,
      );
      expect(fetched.status).toBe(200);
      expect(await fetched.text()).toBe(yamlPayload);
    });

    it('rejects a foreign-workspace presign of the template with 403', async () => {
      await request(server)
        .get('/api/storage/presign/download')
        .query({ bucket: 'nuclei-templates', path: `${templateId}.yaml` })
        .set('Cookie', userB.cookie)
        .expect(403);
    });

    it('lets both colliding workspaces presign the shared screenshot', async () => {
      for (const cookie of [userA.cookie, userB.cookie]) {
        const fetched = await fetchPresigned('screenshot', collisionKey, cookie);
        expect(fetched.status).toBe(200);
        expect(fetched.headers.get('content-type')).toMatch(/image\/png/);
        expect(Buffer.from(await fetched.arrayBuffer()).equals(png)).toBe(true);
      }
    });

    it('rejects the collided screenshot presign for a third workspace with 403', async () => {
      await request(server)
        .get('/api/storage/presign/download')
        .query({ bucket: 'screenshot', path: collisionKey })
        .set('Cookie', userC.cookie)
        .expect(403);
    });

    it('returns 404 for the blocked default bucket', async () => {
      await request(server)
        .get('/api/storage/presign/download')
        .query({ bucket: 'default', path: 'anything.txt' })
        .set('Cookie', userA.cookie)
        .expect(404);
    });

    it.each(['reports', 'job-results'])(
      'rejects the private %s bucket with 403',
      async (bucket) => {
        await request(server)
          .get('/api/storage/presign/download')
          .query({ bucket, path: 'anything.pdf' })
          .set('Cookie', userA.cookie)
          .expect(403);
      },
    );
  });

  describe('anonymous public-read (unsigned, direct to storage)', () => {
    it('serves the public system object as an image, not HTML', async () => {
      const plain = await storage.getClientUrlForPath(`system/${logoKey}`);
      expect(plain.expiresIn).toBeNull();
      expect(plain.url).not.toContain('X-Amz-Signature');

      const fetched = await fetch(plain.url);
      expect(fetched.status).toBe(200);
      const contentType = fetched.headers.get('content-type') ?? '';
      expect(contentType).toMatch(/image\/png/);
      expect(contentType).not.toMatch(/text\/html/);
      expect(Buffer.from(await fetched.arrayBuffer()).equals(png)).toBe(true);
    });

    it('serves the public cached-static object with its stored Content-Type', async () => {
      const plain = await storage.getClientUrlForPath(`cached-static/${staticKey}`);
      expect(plain.expiresIn).toBeNull();

      const fetched = await fetch(plain.url);
      expect(fetched.status).toBe(200);
      expect(fetched.headers.get('content-type')).toMatch(/text\/plain/);
      expect(await fetched.text()).toBe(textPayload);
    });

    it('denies anonymous reads of the tenant screenshot bucket with 403', async () => {
      const fetched = await fetch(`${storageOrigin}/screenshot/${ownedKey}`);
      expect(fetched.status).toBe(403);
    });

    it('denies anonymous reads of the blocked default bucket with 403', async () => {
      const fetched = await fetch(`${storageOrigin}/default/anything.txt`);
      expect(fetched.status).toBe(403);
    });

    it('denies anonymous PUT with 403 and stores nothing', async () => {
      const probeKey = `e2e-anon-put-${Date.now()}.png`;
      const put = await fetch(`${storageOrigin}/system/${probeKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: png,
      });
      expect(put.status).toBe(403);

      // A denied write must leave no object behind: a missing public key 404s.
      const missing = await fetch(`${storageOrigin}/system/${probeKey}`);
      expect(missing.status).toBe(404);
    });

    it('denies anonymous DELETE with 403', async () => {
      const deleted = await fetch(`${storageOrigin}/system/${logoKey}`, {
        method: 'DELETE',
      });
      expect(deleted.status).toBe(403);
    });
  });

  describe('flag-off fallback', () => {
    it('emits a presigned URL that still loads when public-read is not applied', async () => {
      const fallbackInternals = storage as unknown as {
        publicReadApplied: Set<string>;
      };
      const hadSystem = fallbackInternals.publicReadApplied.has('system');
      const hadStatic = fallbackInternals.publicReadApplied.has('cached-static');
      fallbackInternals.publicReadApplied.delete('system');
      fallbackInternals.publicReadApplied.delete('cached-static');
      try {
        const fallback = await storage.getClientUrlForPath(`system/${logoKey}`);
        expect(fallback.expiresIn).toBeGreaterThan(0);
        expect(fallback.url).toContain('X-Amz-Signature');

        const fetched = await fetch(fallback.url);
        expect(fetched.status).toBe(200);
        expect(fetched.headers.get('content-type')).toMatch(/image\/png/);
        expect(Buffer.from(await fetched.arrayBuffer()).equals(png)).toBe(true);
      } finally {
        if (hadSystem) fallbackInternals.publicReadApplied.add('system');
        if (hadStatic) fallbackInternals.publicReadApplied.add('cached-static');
      }
    });
  });

  it('404s the removed byte-streaming read route', async () => {
    await request(server)
      .get(`/api/storage/system/${logoKey}`)
      .set('Cookie', userA.cookie)
      .expect(404);
  });
});
