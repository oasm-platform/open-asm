import { auth } from '@/modules/auth/auth';
import type { Auth } from 'better-auth';
import { randomUUID } from 'node:crypto';
import type { Server } from 'http';
import * as request from 'supertest';

/**
 * Creates a user through better-auth and returns a session cookie for it.
 *
 * `/sign-up/email` is closed over HTTP (`disabledPaths` in `auth.ts`), so the
 * account is made with the server-side `auth.api.signUpEmail` call, the same
 * one the first-admin bootstrap uses. The cookie then comes from a real HTTP
 * sign-in, so the spec still exercises the password hashing, session creation
 * and cookie-attribute path a browser hits, and guard assertions run against a
 * genuine session.
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

  const { user } = await (auth as Auth).api.signUpEmail({
    body: { email, password, name: overrides.name ?? 'E2E User' },
  });

  const cookie = await signIn(server, email, password);
  return { cookie, userId: user.id, email, password };
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