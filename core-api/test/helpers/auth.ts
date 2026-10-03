import { randomUUID } from 'node:crypto';
import type { Server } from 'http';
import * as request from 'supertest';

/**
 * Creates a user through the real better-auth HTTP endpoint and returns its
 * session cookie.
 *
 * Signing up over HTTP (rather than inserting a row) means the spec exercises
 * the same password hashing, session creation and cookie-attribute path that a
 * browser hits, so guard assertions run against a genuine session.
 */
export async function signUp(
  server: Server,
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<{ cookie: string; userId: string; email: string; password: string }> {
  // Unique per call: the users table is unique on email, and specs re-run
  // against a database that is deliberately NOT dropped locally between runs.
  // `randomUUID`, not `Math.random`: the stamp only needs collision resistance,
  // but CodeQL reads `Math.random` as insecure randomness (js/insecure-randomness)
  // because the value ends up in an account identifier.
  const stamp = randomUUID();
  const email = overrides.email ?? `e2e-${stamp}@example.com`;
  const password = overrides.password ?? 'Password123!';

  const res = await request(server)
    .post('/api/auth/sign-up/email')
    .send({ email, password, name: overrides.name ?? 'E2E User' })
    .expect(200);

  const userId = (res.body as { user: { id: string } }).user.id;
  return { cookie: cookieFrom(res), userId, email, password };
}

/** Signs in an existing account and returns its session cookie. */
export async function signIn(
  server: Server,
  email: string,
  password = 'Password123!',
): Promise<string> {
  const res = await request(server)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .expect(200);
  return cookieFrom(res);
}

/**
 * Flattens `set-cookie` into a single `Cookie` request header.
 *
 * Only the `name=value` pair of each cookie is kept — the attributes
 * (`Path`, `HttpOnly`, `SameSite`) belong on the response, not the request.
 */
export function cookieFrom(res: request.Response): string {
  const setCookie = res.headers['set-cookie'] as unknown as
    | string[]
    | undefined;
  return (setCookie ?? []).map((c) => c.split(';')[0]).join('; ');
}

/** Headers every workspace-scoped request must carry. */
export function wsHeaders(cookie: string, workspaceId?: string): Record<string, string> {
  return {
    Cookie: cookie,
    ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
  };
}