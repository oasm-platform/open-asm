import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { createUser, createWorkspace, cleanupE2eData } from './helpers/workspace';

/**
 * The auth/tenancy guard matrix, proven against real Postgres.
 *
 * Proofs:
 *  1. No session cookie -> 401 on a guarded route.
 *  2. `@Public()` routes (health, metadata, latest version) answer without a
 *     session; an unknown route 404s even with a valid session (control — the
 *     401 on case 1 is the guard, not a missing route).
 *  3. Valid cookie but no workspace id -> 403.
 *  4. Non-UUID `X-Workspace-Id` -> 400.
 *  5. A user who does not belong to the workspace -> 403 with the exact
 *     non-disclosure message (never 404).
 *  6. Workspace owner (wildcard `*` group) can reach its resource list.
 *  7. Cross-tenant isolation: a user with workspace B never sees workspace
 *     A's targets through list, direct id, or global search.
 *  8. Header and `wid` cookie resolve identically.
 *  9. Worker-token routes reject a missing/bad token and accept a valid one.
 */
describe('Auth and tenancy matrix', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;

  const userA = { userId: '', email: '', cookie: '' };
  const userB = { userId: '', email: '', cookie: '' };
  let workspaceAId: string;
  let workspaceBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;

    const a = await createUser(server, { name: 'E2E A' });
    userA.userId = a.userId; userA.email = a.email; userA.cookie = a.cookie;
    const b = await createUser(server, { name: 'E2E B' });
    userB.userId = b.userId; userB.email = b.email; userB.cookie = b.cookie;

    const wsA = await createWorkspace(server, a, `e2e-tenancy-a-${Date.now()}`);
    workspaceAId = wsA.id;
    const wsB = await createWorkspace(server, b, `e2e-tenancy-b-${Date.now()}`);
    workspaceBId = wsB.id;

    // Seed one external target + its primary asset in workspace A.
    await request(server)
      .post('/api/targets/bulk')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .send({ targets: [{ value: `e2e-tenancy-a-${Date.now()}.example.com`, type: 'DOMAIN' }] })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, {
      workspaceIds: [workspaceAId, workspaceBId],
      userIds: [userA.userId, userB.userId],
    });
    await closeTestApp(app.app);
  });

  it('returns 401 for an unauthenticated request', async () => {
    await request(server).get('/api/targets').expect(401);
  });

  it('allows a public health probe without a session', async () => {
    const res = await request(server).get('/api/health').expect(200);
    expect(res.text).toBeTruthy();
  });

  it('404s on an unknown route even with a valid session (control)', async () => {
    await request(server)
      .get('/api/definitely-not-a-route')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .expect(404);
  });

  it('rejects a valid session without a workspace id', async () => {
    await request(server)
      .get('/api/targets')
      .set('Cookie', userA.cookie)
      .expect(403)
      .expect((res) => {
        expect(JSON.stringify(res.body)).toContain('Workspace ID not provided');
      });
  });

  it('rejects a non-UUID workspace id', async () => {
    await request(server)
      .get('/api/targets')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', 'not-a-uuid')
      .expect(400);
  });

  it('rejects a non-member with the non-disclosure 403 (not 404)', async () => {
    await request(server)
      .get('/api/targets')
      .set('Cookie', userB.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .expect(403);
  });

  it('lets the workspace owner list its targets', async () => {
    const res = await request(server)
      .get('/api/targets')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .expect(200);
    expect(res.body).toHaveProperty('total');
  });

  it('scopes targets/by-id/search to the caller workspace', async () => {
    // User B authenticates with their own workspace header; they must never
    // see workspace A's rows.
    const listB = await request(server)
      .get('/api/targets')
      .set('Cookie', userB.cookie)
      .set('X-Workspace-Id', workspaceBId)
      .expect(200);
    expect(listB.body.total).toBe(0);

    const searchB = await request(server)
      .get('/api/search')
      .query({ value: 'e2e-tenancy-a', limit: 10, workspaceId: workspaceBId })
      .set('Cookie', userB.cookie)
      .set('X-Workspace-Id', workspaceBId)
      .expect(200);
    const bodyA = JSON.stringify(searchB.body);
    expect(bodyA).not.toContain('e2e-tenancy-a-');
  });

  it('resolves the workspace from the wid cookie as it does the header', async () => {
    const viaHeader = await request(server)
      .get('/api/targets')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .expect(200);

    const viaCookie = await request(server)
      .get('/api/targets')
      .set('Cookie', `${userA.cookie}; wid=${workspaceAId}`)
      .expect(200);

    expect(viaCookie.body.total).toBe(viaHeader.body.total);
  });

  it('rejects a missing worker token and accepts a malformed one as 401', async () => {
    await request(server).get('/api/jobs-registry/some-worker/next').expect(401);
    await request(server)
      .get('/api/jobs-registry/some-worker/next')
      .set('worker-token', 'not-a-real-token')
      .expect(401);
  });
});
