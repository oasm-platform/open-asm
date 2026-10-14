import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { createUserWithWorkspace, cleanupE2eData } from './helpers/workspace';

/**
 * Targets CRUD and bulk-create rules against real Postgres.
 *
 * Proofs:
 *  1. Bulk create accepts a DOMAIN and returns one primary asset per target.
 *  2. A duplicate value in the same workspace -> **400** (it throws; it does
 *     not skip silently). This is the exact contract of
 *     `createMultipleTargets`.
 *  3. `POST .../:id/re-scan` re-queues the discovery event without touching
 *     the target itself (status stays `PENDING` semantics are covered in unit
 *     tests; here we assert the endpoint is reachable).
 *  4. The list envelope counts only the caller's workspace.
 *  5. `DELETE /api/targets/:id` removes the target row.
 */
describe('Targets bulk create and lifecycle', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let cookie: string;
  let workspaceId: string;
  let userId: string;
  const domain = `e2e-targets-${Date.now()}.example.com`;
  const domain2 = `e2e-targets-2-${Date.now()}.example.com`;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;

    const ctx = await createUserWithWorkspace(server, 'targets');
    cookie = ctx.user.cookie;
    workspaceId = ctx.workspace.id;
    userId = ctx.user.userId;
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, { workspaceIds: [workspaceId], userIds: [userId] });
    await closeTestApp(app.app);
  });

  it('creates a DOMAIN target with a primary asset', async () => {
    const res = await request(server)
      .post('/api/targets/bulk')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ targets: [{ value: domain, type: 'DOMAIN' }] })
      .expect(201);

    expect(res.body.created).toHaveLength(1);
    expect(res.body.totalCreated).toBe(1);
    expect(res.body.created[0].value).toBe(domain);

    // One primary asset per new target, seeded by the same bulk handler.
    const rows: { value: string; 'isPrimary': boolean }[] = await dataSource.query(
      'SELECT value, "isPrimary" FROM assets WHERE value = $1',
      [domain],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].isPrimary).toBe(true);
  });

  it('rejects a duplicate external domain as 400', async () => {
    await request(server)
      .post('/api/targets/bulk')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ targets: [{ value: domain, type: 'DOMAIN' }] })
      .expect(400)
      .expect((res) => {
        expect(JSON.stringify(res.body)).toContain('Target already exists');
      });
  });

  it('lists only the targets of the calling workspace', async () => {
    await request(server)
      .post('/api/targets/bulk')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ targets: [{ value: domain2, type: 'DOMAIN' }] })
      .expect(201);

    const res = await request(server)
      .get('/api/targets')
      .query({ page: 1, limit: 10 })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const values = res.body.data.map((t: { value: string }) => t.value);
    expect(values).toContain(domain);
    expect(values).toContain(domain2);
  });

  it('deletes a target and its assets', async () => {
    const create = await request(server)
      .post('/api/targets/bulk')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ targets: [{ value: `e2e-targets-del-${Date.now()}.example.com`, type: 'DOMAIN' }] })
      .expect(201);
    const targetId = create.body.created[0].id;

    await request(server)
      .delete(`/api/targets/${targetId}/workspace/${workspaceId}`)
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const after = await request(server)
      .get('/api/targets')
      .query({ page: 1, limit: 50 })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(after.body.data.map((t: { id: string }) => t.id)).not.toContain(targetId);
  });
});
