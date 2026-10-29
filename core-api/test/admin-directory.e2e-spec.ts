import * as request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { Role } from '../src/common/enums/enum';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { signIn } from './helpers/auth';
import {
  cleanupE2eData,
  createUser,
  createWorkspace,
  type TestUser,
  type TestWorkspace,
} from './helpers/workspace';

/**
 * Admin read access to users and workspaces, over real HTTP.
 *
 * Proofs:
 *  1. Every /api/admin/users* and /api/admin/workspaces* route is 401 for
 *     anonymous callers and 403 for a signed-in non-admin.
 *  2. The user list excludes bot identities, searches name or email, and
 *     narrows to one workspace's members with `workspaceId`.
 *  3. The workspace list covers workspaces the admin is not a member of, and
 *     neither workspace response leaks the encrypted DEK.
 *  4. Only admins can update or archive a workspace; a blank or null name
 *     is a 400, never a 500 from the NOT NULL column.
 *  5. Better Auth's /admin/list-users and /admin/get-user are disabled (404)
 *     even for an admin session — they are replaced by the routes above.
 */
describe('Admin users and workspaces (e2e)', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;

  let admin: TestUser;
  let member: TestUser;
  let bot: TestUser;
  let workspace: TestWorkspace;

  const setRole = (userId: string, role: Role) =>
    dataSource.query(`UPDATE users SET role = $1 WHERE id = $2`, [
      role,
      userId,
    ]);

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;

    // Same grant `POST /api/admin/init` performs internally; a throwaway test
    // DB has no admin to call better-auth's set-role with.
    admin = await createUser(server, { name: 'E2E Directory Admin' });
    await setRole(admin.userId, Role.ADMIN);
    // The sign-up session is cached in Redis with the pre-grant user, and the
    // SQL grant never refreshes it; a new session carries the admin role.
    admin.cookie = await signIn(server, admin.email, admin.password);

    member = await createUser(server, { name: 'E2E Directory Member' });
    workspace = await createWorkspace(server, member);

    bot = await createUser(server, { name: 'E2E Directory Bot' });
    await setRole(bot.userId, Role.BOT);
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, {
      workspaceIds: [workspace.id],
      userIds: [admin.userId, member.userId, bot.userId],
    });
    await closeTestApp(app.app);
  });

  it('refuses anonymous callers (401) and non-admins (403)', async () => {
    const paths = [
      '/api/admin/users',
      `/api/admin/users/${member.userId}`,
      '/api/admin/workspaces',
      `/api/admin/workspaces/${workspace.id}`,
    ];

    for (const path of paths) {
      await request(server).get(path).expect(401);
      await request(server).get(path).set('Cookie', member.cookie).expect(403);
    }
  });

  it('lists users by name or email, without bots', async () => {
    const byName = await request(server)
      .get('/api/admin/users')
      .query({ search: 'E2E Directory', limit: 100 })
      .set('Cookie', admin.cookie)
      .expect(200);

    const ids = (byName.body as { data: Array<{ id: string }> }).data.map(
      (user) => user.id,
    );
    expect(ids).toEqual(expect.arrayContaining([admin.userId, member.userId]));
    expect(ids).not.toContain(bot.userId);

    const byEmail = await request(server)
      .get('/api/admin/users')
      .query({ search: member.email })
      .set('Cookie', admin.cookie)
      .expect(200);

    expect(byEmail.body).toMatchObject({
      total: 1,
      data: [{ id: member.userId, email: member.email, role: Role.USER }],
    });
  });

  it('lists the members of a workspace with workspaceId', async () => {
    const res = await request(server)
      .get('/api/admin/users')
      .query({ workspaceId: workspace.id })
      .set('Cookie', admin.cookie)
      .expect(200);

    // The admin is not a member, so only the owner comes back.
    expect(res.body).toMatchObject({
      total: 1,
      data: [{ id: member.userId }],
    });

    await request(server)
      .get('/api/admin/users')
      .query({ workspaceId: 'not-a-uuid' })
      .set('Cookie', admin.cookie)
      .expect(400);
  });

  it('gets a user by id, 404 when unknown', async () => {
    const res = await request(server)
      .get(`/api/admin/users/${member.userId}`)
      .set('Cookie', admin.cookie)
      .expect(200);

    expect(res.body).toMatchObject({
      id: member.userId,
      email: member.email,
      role: Role.USER,
    });

    // The guard records the admin's request before the handler reads it back.
    const self = await request(server)
      .get(`/api/admin/users/${admin.userId}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    const { lastActiveAt } = self.body as { lastActiveAt: string | null };
    expect(Date.now() - Date.parse(lastActiveAt ?? '')).toBeLessThan(60_000);

    await request(server)
      .get('/api/admin/users/00000000-0000-4000-8000-000000000000')
      .set('Cookie', admin.cookie)
      .expect(404);
  });

  it('lists workspaces the admin is not a member of, with owner and counts', async () => {
    const res = await request(server)
      .get('/api/admin/workspaces')
      .query({ search: workspace.name })
      .set('Cookie', admin.cookie)
      .expect(200);

    const body = res.body as { total: number; data: object[] };
    expect(body.total).toBe(1);
    expect(body.data[0]).toMatchObject({
      id: workspace.id,
      name: workspace.name,
      owner: { id: member.userId, email: member.email },
      memberCount: 1,
      targetCount: 0,
    });
    expect(body.data[0]).not.toHaveProperty('dek');
  });

  it('gets a workspace by id with owner and counts, 404 when unknown', async () => {
    const res = await request(server)
      .get(`/api/admin/workspaces/${workspace.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);

    expect(res.body).toMatchObject({
      id: workspace.id,
      owner: { id: member.userId, email: member.email },
      memberCount: 1,
    });
    expect(res.body).not.toHaveProperty('dek');
    expect(res.body).not.toHaveProperty('members');

    await request(server)
      .get('/api/admin/workspaces/00000000-0000-4000-8000-000000000000')
      .set('Cookie', admin.cookie)
      .expect(404);
  });

  it('lets only admins update and archive a workspace', async () => {
    await request(server)
      .patch(`/api/admin/workspaces/${workspace.id}`)
      .set('Cookie', member.cookie)
      .send({ name: 'hijacked' })
      .expect(403);
    await request(server)
      .patch(`/api/admin/workspaces/${workspace.id}/archived`)
      .set('Cookie', member.cookie)
      .send({ isArchived: true })
      .expect(403);
  });

  it('updates a workspace and rejects an empty or null name', async () => {
    const renamed = `${workspace.name}-renamed`;
    const res = await request(server)
      .patch(`/api/admin/workspaces/${workspace.id}`)
      .set('Cookie', admin.cookie)
      .send({ name: `  ${renamed}  `, isAssetsDiscovery: false })
      .expect(200);

    expect(res.body).toMatchObject({
      id: workspace.id,
      name: renamed,
      isAssetsDiscovery: false,
    });
    expect(res.body).not.toHaveProperty('dek');
    workspace.name = renamed;

    for (const name of ['', '   ', null]) {
      await request(server)
        .patch(`/api/admin/workspaces/${workspace.id}`)
        .set('Cookie', admin.cookie)
        .send({ name })
        .expect(400);
    }
  });

  it('archives and restores a workspace', async () => {
    const archived = await request(server)
      .patch(`/api/admin/workspaces/${workspace.id}/archived`)
      .set('Cookie', admin.cookie)
      .send({ isArchived: true })
      .expect(200);
    expect((archived.body as { archivedAt: string | null }).archivedAt).toBeTruthy();

    const listed = await request(server)
      .get('/api/admin/workspaces')
      .query({ search: workspace.name, isArchived: true })
      .set('Cookie', admin.cookie)
      .expect(200);
    expect((listed.body as { total: number }).total).toBe(1);

    const restored = await request(server)
      .patch(`/api/admin/workspaces/${workspace.id}/archived`)
      .set('Cookie', admin.cookie)
      .send({ isArchived: false })
      .expect(200);
    expect((restored.body as { archivedAt: string | null }).archivedAt).toBeNull();
  });

  it("disables Better Auth's list-users and get-user, even for an admin", async () => {
    await request(server)
      .get('/api/auth/admin/list-users')
      .set('Cookie', admin.cookie)
      .expect(404);
    await request(server)
      .get('/api/auth/admin/get-user')
      .query({ id: member.userId })
      .set('Cookie', admin.cookie)
      .expect(404);
  });
});
