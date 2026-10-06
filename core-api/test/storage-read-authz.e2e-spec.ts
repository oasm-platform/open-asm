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
 * Storage read authorization, proven against real Postgres + real RustFS.
 *
 * Both read paths share one helper (`authorizeRead`): `GET
 * /api/storage/:bucket/:path` and `GET /api/storage/presign/download`.
 * Bucket classes: `system` is anonymous, `cached-static` needs a session,
 * `screenshot`/`nuclei-templates` need a session AND membership of ANY
 * workspace that owns the object (screenshot keys are `md5(asset.value)` and
 * can collide across workspaces), `default` 404s, `reports` stays 403.
 *
 * Proofs:
 *  1. `GET` matrix: anon `system`→200; anon `screenshot`→401; owner→200;
 *     foreign-workspace member→403; authed unknown screenshot→404;
 *     `default`→404; `reports`→403; anon `cached-static`→401, authed→200.
 *  2. Presign matrix (the bypass that kept AE-02 open): anon→401; owner
 *     presigns own template/screenshot→200; foreign member presigns→403.
 *  3. Collision: the same `screenshotPath` seeded in workspace A and B is
 *     readable by members of BOTH, but 403 for a third workspace.
 */
describe('Storage read authorization (e2e)', () => {
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
  /** `cached-static` object key, session-only. */
  let staticKey = '';
  /** `screenshot/<key>` owned by BOTH workspace A and B (the collision). */
  let collisionKey = '';
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

  it('lets anonymous reads of the system bucket through (login logo)', async () => {
    await request(server)
      .get(`/api/storage/system/${logoKey}`)
      .expect(200)
      .expect('Content-Type', /image\/png/);
  });

  it('rejects anonymous screenshot reads with 401', async () => {
    await request(server).get(`/api/storage/screenshot/${ownedKey}`).expect(401);
  });

  it('serves the owned screenshot to its workspace member', async () => {
    await request(server)
      .get(`/api/storage/screenshot/${ownedKey}`)
      .set('Cookie', userA.cookie)
      .expect(200)
      .expect('Content-Type', /image\/png/);
  });

  it('rejects the owned screenshot for a foreign-workspace member with 403', async () => {
    await request(server)
      .get(`/api/storage/screenshot/${ownedKey}`)
      .set('Cookie', userB.cookie)
      .expect(403);
  });

  it('returns 404 for an authenticated read of an unowned screenshot key', async () => {
    const unknown = `${createHash('md5').update(`e2e-read-authz-missing-${Date.now()}`).digest('hex')}.png`;
    await request(server)
      .get(`/api/storage/screenshot/${unknown}`)
      .set('Cookie', userA.cookie)
      .expect(404);
  });

  it('returns 404 for the blocked default bucket', async () => {
    await request(server)
      .get('/api/storage/default/anything.txt')
      .set('Cookie', userA.cookie)
      .expect(404);
  });

  it('rejects the private reports bucket with 403', async () => {
    await request(server)
      .get('/api/storage/reports/anything.pdf')
      .set('Cookie', userA.cookie)
      .expect(403);
  });

  it('rejects anonymous cached-static reads with 401', async () => {
    await request(server).get(`/api/storage/cached-static/${staticKey}`).expect(401);
  });

  it('serves cached-static objects to any authenticated user', async () => {
    const res = await request(server)
      .get(`/api/storage/cached-static/${staticKey}`)
      .set('Cookie', userB.cookie)
      .expect(200);
    expect(res.text).toBe(textPayload);
  });

  it('rejects anonymous presign downloads with 401', async () => {
    await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: 'screenshot', path: ownedKey })
      .expect(401);
  });

  it('lets the owner presign their own template', async () => {
    const res = await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: 'nuclei-templates', path: `${templateId}.yaml` })
      .set('Cookie', userA.cookie)
      .expect(200);
    expect((res.body as { downloadUrl: string }).downloadUrl).toBeTruthy();
  });

  it('rejects a foreign-workspace presign of the template with 403', async () => {
    await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: 'nuclei-templates', path: `${templateId}.yaml` })
      .set('Cookie', userB.cookie)
      .expect(403);
  });

  it('lets the owner presign their own screenshot', async () => {
    const res = await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: 'screenshot', path: ownedKey })
      .set('Cookie', userA.cookie)
      .expect(200);
    expect((res.body as { downloadUrl: string }).downloadUrl).toBeTruthy();
  });

  it('rejects a foreign-workspace presign of the screenshot with 403', async () => {
    await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: 'screenshot', path: ownedKey })
      .set('Cookie', userB.cookie)
      .expect(403);
  });

  it('serves the collided screenshot to workspace A', async () => {
    await request(server)
      .get(`/api/storage/screenshot/${collisionKey}`)
      .set('Cookie', userA.cookie)
      .expect(200);
  });

  it('serves the collided screenshot to workspace B', async () => {
    await request(server)
      .get(`/api/storage/screenshot/${collisionKey}`)
      .set('Cookie', userB.cookie)
      .expect(200);
  });

  it('rejects the collided screenshot for a third workspace with 403', async () => {
    await request(server)
      .get(`/api/storage/screenshot/${collisionKey}`)
      .set('Cookie', userC.cookie)
      .expect(403);
  });

  describe('conditional GET (304)', () => {
    it('returns an ETag and a private cache header on authenticated reads', async () => {
      const res = await request(server)
        .get(`/api/storage/cached-static/${staticKey}`)
        .set('Cookie', userB.cookie)
        .expect(200);
      expect(res.headers['etag']).toBeTruthy();
      expect(res.headers['cache-control']).toBe('private, no-cache');
    });

    it('returns 304 with an empty body on an ETag match', async () => {
      const first = await request(server)
        .get(`/api/storage/cached-static/${staticKey}`)
        .set('Cookie', userB.cookie)
        .expect(200);
      const etag = first.headers['etag'];
      expect(etag).toBeTruthy();
      const res = await request(server)
        .get(`/api/storage/cached-static/${staticKey}`)
        .set('Cookie', userB.cookie)
        .set('If-None-Match', etag)
        .expect(304);
      expect(res.text).toBe('');
    });

    it('returns 200 with bytes on a stale ETag', async () => {
      const res = await request(server)
        .get(`/api/storage/cached-static/${staticKey}`)
        .set('Cookie', userB.cookie)
        .set('If-None-Match', '"stale-etag-that-never-matches"')
        .expect(200);
      expect(res.text).toBe(textPayload);
    });
  });
});
