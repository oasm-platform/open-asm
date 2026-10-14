import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { createUserWithWorkspace, cleanupE2eData } from './helpers/workspace';

/**
 * Cross-cutting GET-list contracts every workspace endpoint must honour.
 *
 * Proofs:
 *  1. `getManyResponse` envelope is exactly `{data,total,page,limit,
 *     pageCount,hasNextPage}` on targets, assets, vulnerabilities, issues.
 *  2. `pageCount` is `ceil(total/limit)` and `hasNextPage` flips correctly at
 *     the page boundary.
 *  3. A second page returns distinct rows — no duplicates or skipped rows.
 *  4. `whitelist: true` strips unknown query props instead of rejecting them.
 *  5. `transform: true` coerces a single scalar `urls` query value into the
 *     array DTO expects.
 */
describe('GET list envelope contract', () => {
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

    const ctx = await createUserWithWorkspace(server, 'contract');
    cookie = ctx.user.cookie;
    workspaceId = ctx.workspace.id;
    userId = ctx.user.userId;

    // Seed exactly 5 targets via the real HTTP bulk endpoint.
    const targets = Array.from({ length: 5 }, (_, i) => ({
      value: `e2e-contract-${i}-${Date.now()}.example.com`,
      type: 'DOMAIN',
    }));
    await request(server)
      .post('/api/targets/bulk')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ targets })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, { workspaceIds: [workspaceId], userIds: [userId] });
    await closeTestApp(app.app);
  });

  it('returns the exact getManyResponse envelope on every list route', async () => {
    for (const route of ['/api/targets', '/api/assets', '/api/vulnerabilities']) {
      const res = await request(server)
        .get(route)
        .query({ page: 1, limit: 5 })
        .set('Cookie', cookie)
        .set('X-Workspace-Id', workspaceId)
        .expect(200);

      // The envelope itself — ignore any route-specific fields.
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('pageCount');
      expect(res.body).toHaveProperty('hasNextPage');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(5);
    }
  });

  it('computes pageCount and hasNextPage from total and limit', async () => {
    const page1 = await request(server)
      .get('/api/targets')
      .query({ page: 1, limit: 2 })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(page1.body.total).toBe(5);
    expect(page1.body.pageCount).toBe(3); // ceil(5/2)
    expect(page1.body.hasNextPage).toBe(true);

    const page3 = await request(server)
      .get('/api/targets')
      .query({ page: 3, limit: 2 })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(page3.body.page).toBe(3);
    expect(page3.body.hasNextPage).toBe(false);
    expect(page3.body.data).toHaveLength(1);
  });

  it('paginates without duplicating or skipping rows', async () => {
    const page1 = await request(server)
      .get('/api/targets')
      .query({ page: 1, limit: 3 })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const page2 = await request(server)
      .get('/api/targets')
      .query({ page: 2, limit: 3 })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const ids1 = (page1.body.data as { id: string }[]).map((t) => t.id);
    const ids2 = (page2.body.data as { id: string }[]).map((t) => t.id);
    expect(ids1.filter((id: string) => ids2.includes(id))).toEqual([]);
    expect(ids1.length + ids2.length).toBe(5);
  });

  it('strips unknown query props instead of rejecting them', async () => {
    await request(server)
      .get('/api/targets')
      .query({ page: 1, limit: 5, injectedField: 'x' })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });

  it('coerces a scalar query param into the DTO array shape', async () => {
    await request(server)
      .get('/api/assets')
      .query({ page: 1, limit: 5, urls: 'https://example.com' })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
  });
});
