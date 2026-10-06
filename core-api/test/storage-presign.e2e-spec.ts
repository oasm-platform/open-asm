import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { DEFAULT_RUSTFS_ENDPOINT } from '../src/modules/storage/storage.config';
import { Role } from '../src/common/enums/enum';
import { StorageService } from '../src/modules/storage/storage.service';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { createUser, cleanupE2eData } from './helpers/workspace';

/**
 * Direct-to-storage presigned access, proven over real HTTP against real RustFS.
 *
 * This is the repeatable form of the live QA round-trip recorded in
 * `.omo/evidence/presigned-storage-access/e2e-roundtrip.md` and the negative
 * matrix in `security.md`. The unit and controller suites already pin the
 * branching; what only a booted stack can prove is that the URL the API hands
 * out actually moves bytes — signed PUT, signed GET, same content back.
 *
 * Proofs:
 *  1. `POST /api/storage/presign/upload` (ADMIN) returns a URL hosted on the
 *     presign endpoint (`S3_PUBLIC_ENDPOINT` → `RUSTFS_ENDPOINT` → default) and
 *     carrying `X-Amz-Signature`; PUTting the bytes to it is a 200 and writes
 *     the object.
 *  2. `GET /api/storage/presign/download` returns a URL that fetches the very
 *     same bytes back — compared by sha256, not by length.
 *  3. The guard is live on the download route: anonymous -> 401.
 *  4. Private buckets (`reports`) are refused with 403, unknown buckets with
 *     400, traversal paths (`../etc/passwd`) with 400, restricted extensions
 *     (`.exe`) with 400.
 *  5. The removed streaming endpoints (`POST /api/storage/upload`,
 *     `GET /api/storage/:bucket/:path/download`) are gone: 404 with a session.
 *
 * ponytail: the PUT/GET run from the test process, so `S3_PUBLIC_ENDPOINT` must
 * be reachable from the machine running the suite. A public host that only
 * resolves inside a browser will fail proofs 1-2; point it at the reachable
 * origin (`RUSTFS_ENDPOINT`) in CI, or add a host alias when that changes.
 */
describe('Presigned storage access (e2e)', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let storage: StorageService;

  const admin = { userId: '', cookie: '' };
  /** Host:port the presigner is expected to sign for, resolved the same way `parseStorageConfig` does. */
  let presignOrigin: string;
  /** Key of the object written by the happy path, deleted in `afterAll`. */
  let uploadedKey = '';
  const uploadedBucket = 'system';

  const payload = Buffer.from('oasm presigned storage e2e round-trip\n', 'utf8');
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;
    storage = app.app.get(StorageService);

    const config = app.app.get(ConfigService);
    presignOrigin =
      config.get<string>('S3_PUBLIC_ENDPOINT') ||
      config.get<string>('RUSTFS_ENDPOINT') ||
      DEFAULT_RUSTFS_ENDPOINT;

    const signedUp = await createUser(server, { name: 'E2E Presign Admin' });
    admin.userId = signedUp.userId;
    admin.cookie = signedUp.cookie;

    // `POST /api/auth/admin/set-role` (better-auth's admin plugin) requires an
    // admin that a throwaway test DB has no reason to have, so this performs the
    // same grant `POST /api/init-admin` performs internally. `AuthGuard` reads
    // the user row through `getSession` on every request, so no re-login is
    // needed — and the upload assertion below failing with 403 would mean the
    // grant did not take, rather than passing silently as a non-admin.
    await dataSource.query(`UPDATE users SET role = $1 WHERE id = $2`, [
      Role.ADMIN,
      admin.userId,
    ]);
  });

  afterAll(async () => {
    if (uploadedKey) {
      await storage.deleteFile(uploadedKey, uploadedBucket);
    }
    await cleanupE2eData(dataSource, { userIds: [admin.userId] });
    await closeTestApp(app.app);
  });

  it('presigns an upload on the presign host, and the PUT stores the object', async () => {
    const res = await request(server)
      .post('/api/storage/presign/upload')
      .set('Cookie', admin.cookie)
      .send({ fileName: 'proof.txt', bucket: uploadedBucket, contentType: 'text/plain' })
      .expect(201);

    const body = res.body as { uploadUrl: string; key: string; path: string; expiresIn: number };
    expect(body.expiresIn).toBeGreaterThan(0);
    expect(body.key).toMatch(/\.txt$/);
    expect(body.path).toBe(`${uploadedBucket}/${body.key}`);
    uploadedKey = body.key;

    const uploadUrl = new URL(body.uploadUrl);
    // Signed for the browser-reachable endpoint, not the server-side one.
    expect(uploadUrl.origin).toBe(new URL(presignOrigin).origin);
    expect(uploadUrl.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBe(String(body.expiresIn));
    // Content-Type is signed, so it must be sent back byte-identical.
    expect(uploadUrl.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');

    const put = await fetch(body.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    });
    expect(put.status).toBe(200);
  });

  it('presigns a download that returns the uploaded bytes (sha256 equal)', async () => {
    expect(uploadedKey).not.toBe('');

    const res = await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: uploadedBucket, path: uploadedKey })
      .set('Cookie', admin.cookie)
      .expect(200);

    const body = res.body as { downloadUrl: string; expiresIn: number };
    expect(body.expiresIn).toBeGreaterThan(0);
    const downloadUrl = new URL(body.downloadUrl);
    expect(downloadUrl.origin).toBe(new URL(presignOrigin).origin);
    expect(downloadUrl.searchParams.get('X-Amz-Signature')).toBeTruthy();

    const fetched = await fetch(body.downloadUrl);
    expect(fetched.status).toBe(200);
    const bytes = Buffer.from(await fetched.arrayBuffer());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(payloadSha256);
    expect(bytes).toEqual(payload);
  });

  it('rejects an anonymous presign download with 401', async () => {
    await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: uploadedBucket, path: uploadedKey })
      .expect(401);
  });

  it('rejects the private reports bucket with 403', async () => {
    await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: 'reports', path: 'anything.pdf' })
      .set('Cookie', admin.cookie)
      .expect(403);
  });

  it('rejects an unknown bucket with 400', async () => {
    await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: 'unknown', path: 'anything.pdf' })
      .set('Cookie', admin.cookie)
      .expect(400);
  });

  it('rejects a traversal path with 400', async () => {
    await request(server)
      .get('/api/storage/presign/download')
      .query({ bucket: uploadedBucket, path: '../etc/passwd' })
      .set('Cookie', admin.cookie)
      .expect(400);
  });

  it('rejects a restricted upload extension with 400', async () => {
    await request(server)
      .post('/api/storage/presign/upload')
      .set('Cookie', admin.cookie)
      .send({ fileName: 'x.exe' })
      .expect(400);
  });

  it('404s the removed POST /api/storage/upload streaming endpoint', async () => {
    await request(server)
      .post('/api/storage/upload')
      .set('Cookie', admin.cookie)
      .expect(404);
  });

  it('404s the removed GET /api/storage/:bucket/:path/download endpoint', async () => {
    await request(server)
      .get(`/api/storage/${uploadedBucket}/proof.txt/download`)
      .query({ token: 'whatever' })
      .set('Cookie', admin.cookie)
      .expect(404);
  });
});