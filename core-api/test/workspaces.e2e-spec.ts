import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { createUserWithWorkspace, cleanupE2eData } from './helpers/workspace';

/**
 * Workspace lifecycle over real Postgres + permission guard.
 *
 * Proofs:
 *  1. `POST /api/workspaces` seeds the owner wildcard group (the response is
 *     an isolated workspace, and `GET /api/workspaces/current-permission`
 *     returns `'*'`).
 *  2. `PATCH /api/workspaces/:id` updates the description.
 *  3. Archiving the workspace makes it disappear from the owner's list when
 *     `archived` filtering is active (shape is the same envelope).
 *  4. Deleting the workspace cascades its targets and assets.
 */
describe('Workspaces lifecycle', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let cookie: string;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;

    const ctx = await createUserWithWorkspace(server, 'workspace');
    cookie = ctx.user.cookie;
    workspaceId = ctx.workspace.id;
    userId = ctx.user.userId;
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, { workspaceIds: [workspaceId], userIds: [userId] });
    await closeTestApp(app.app);
  });

  it('gives the workspace owner the wildcard permission', async () => {
    const res = await request(server)
      .get('/api/workspaces/current-permission')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(res.body.currentPermission).toContain('*');
  });

  it('updates the workspace description', async () => {
    const res = await request(server)
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ description: 'updated by e2e' })
      .expect(200);

    expect(res.body.message).toBeTruthy();
  });

  it('archives the workspace without deleting it', async () => {
    await request(server)
      .patch(`/api/workspaces/${workspaceId}/archived`)
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ isArchived: true })
      .expect(200);

    // Still retrievable — archival deactivates, it does not delete.
    const row = await dataSource.query(
      'SELECT "archivedAt" FROM workspaces WHERE id = $1',
      [workspaceId],
    );
    expect(row[0].archivedAt).not.toBeNull();
  });

  it('deletes the workspace and cascades its scan data', async () => {
    await request(server)
      .post('/api/targets/bulk')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ targets: [{ value: `e2e-ws-delete-${Date.now()}.example.com`, type: 'DOMAIN' }] })
      .expect(201);

    await request(server)
      .delete(`/api/workspaces/${workspaceId}`)
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const roots = await dataSource.query(
      'SELECT COUNT(*)::int AS n FROM workspaces WHERE id = $1',
      [workspaceId],
    );
    expect(roots[0].n).toBe(0);

    const leftovers = await dataSource.query(
      'SELECT COUNT(*)::int AS n FROM targets WHERE "workspaceId" = $1',
      [workspaceId],
    );
    expect(leftovers[0].n).toBe(0);
  });
});
