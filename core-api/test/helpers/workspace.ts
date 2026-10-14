import { randomUUID } from 'node:crypto';
import type { Server } from 'http';
import * as request from 'supertest';
import type { DataSource } from 'typeorm';
import { signUp, wsHeaders } from './auth';

/** A signed-up user plus the cookie that authenticates it. */
export interface TestUser {
  userId: string;
  email: string;
  password: string;
  cookie: string;
}

/** A workspace owned by `user`, created over real HTTP. */
export interface TestWorkspace {
  id: string;
  name: string;
}

/**
 * Registers a user with no rows attached to it.
 *
 * Kept separate from `createWorkspace` because the tenancy specs need a second
 * identity that owns nothing, and a workspace per user would defeat the point
 * of the cross-tenant assertions.
 */
export async function createUser(
  server: Server,
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<TestUser> {
  const { cookie, userId, email, password } = await signUp(server, overrides);
  return { userId, email, password, cookie };
}

/**
 * Creates a workspace owned by the signed-up user.
 *
 * Going through `POST /api/workspaces` rather than inserting a row is what
 * makes the fixture trustworthy: the handler runs one transaction that writes
 * the workspace, its owner membership and the seeded owner permission group
 * holding `'*'`, and only then materialises the default workflows. A workspace
 * built by hand would have the owner row but no wildcard group, and every
 * subsequent `@WorkspaceAccess` assertion would fail for the wrong reason.
 */
export async function createWorkspace(
  server: Server,
  user: TestUser,
  // `randomUUID`, not `Math.random`: the default name only needs to stay distinct
  // between specs, but CodeQL reads `Math.random` as insecure randomness
  // (js/insecure-randomness) because the value identifies a tenant-scoped row.
  name = `e2e-ws-${randomUUID()}`,
): Promise<TestWorkspace> {
  const res = await request(server)
    .post('/api/workspaces')
    .set('Cookie', user.cookie)
    .send({ name, description: 'e2e' })
    .expect(201);

  return { id: (res.body as { id: string }).id, name };
}

/** Signed-up user owning a fresh workspace — the fixture most specs want. */
export async function createUserWithWorkspace(
  server: Server,
  label = 'ws',
): Promise<{ user: TestUser; workspace: TestWorkspace; headers: Record<string, string> }> {
  const user = await createUser(server, { name: `E2E ${label}` });
  const workspace = await createWorkspace(server, user, `e2e-${label}-${Date.now()}`);
  return { user, workspace, headers: wsHeaders(user.cookie, workspace.id) };
}

/**
 * Deletes workspaces and user rows created by a spec.
 *
 * Workspaces cascade to their targets, assets, jobs and scan data. The user
 * rows are cleaned up separately because better-auth disables user deletion by
 * design (`auth.ts` — a user deletion cascades through `workspaces.ownerId`),
 * so an e2e run would otherwise leave one account behind per spec on every
 * local invocation, given the database is not dropped between runs.
 */
export async function cleanupE2eData(
  dataSource: DataSource,
  ids: { workspaceIds?: string[]; userIds?: string[] },
): Promise<void> {
  const { workspaceIds = [], userIds = [] } = ids;

  for (const workspaceId of workspaceIds) {
    await dataSource.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  }
  for (const userId of userIds) {
    await dataSource.query('DELETE FROM sessions WHERE "userId" = $1', [userId]);
    await dataSource.query('DELETE FROM accounts WHERE "userId" = $1', [userId]);
    await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
  }
}