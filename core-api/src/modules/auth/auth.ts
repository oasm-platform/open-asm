import { AUTH_IGNORE_ROUTERS } from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import { databaseConnectionConfig } from '@/database/database-config';
import { betterAuth } from 'better-auth';
import { admin, openAPI } from 'better-auth/plugins';
import { randomUUID } from 'crypto';
import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Fail closed on a missing/weak session-signing secret.
 *
 * better-auth silently falls back to the constant
 * `"better-auth-secret-12345678901234567890"` (published in its own npm
 * package) when no secret is supplied. Its own safety net
 * (`create-context.mjs` → `validateSecret`) only throws when
 * `NODE_ENV === 'production'`, so any deployment that omits the secret AND
 * leaves NODE_ENV unset boots successfully with a publicly-known key — every
 * session cookie becomes forgeable by anyone who has read the package source.
 */
function requireAuthSecret(): string {
  // Jest sets NODE_ENV=test; unit tests boot AppModule without a real secret.
  // Any other environment must supply one.
  if (process.env.NODE_ENV === 'test') {
    return 'test-only-better-auth-secret-not-used-in-production';
  }
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` ' +
        'and add it to core-api/.env (see core-api/example.env). The application ' +
        'refuses to start with better-auth\'s publicly-known default signing secret.',
    );
  }
  if (secret.length < 32) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least 32 characters (got ${secret.length}). ` +
        'Generate one with `openssl rand -base64 32`.',
    );
  }
  if (secret.startsWith('your-') || secret === 'change_me') {
    throw new Error(
      'BETTER_AUTH_SECRET still holds a placeholder value from example.env. ' +
        'Replace it before starting the application.',
    );
  }
  return secret;
}

/**
 * Origins allowed to make credentialed requests.
 *
 * `['*']` previously disabled better-auth's own CSRF origin validation
 * (`validateOrigin` matches every pattern against `'*'`, making the
 * `INVALID_ORIGIN` throw unreachable). The REST API has no CSRF token
 * mechanism, so this list is the actual cross-origin trust boundary.
 */
function resolveTrustedOrigins(): string[] {
  const raw = process.env.TRUSTED_ORIGINS?.trim();
  if (!raw) {
    // No configuration: trust only same-origin/host requests. Deployments
    // serving the console from a different origin must set TRUSTED_ORIGINS
    // explicitly (e.g. `https://app.example.com,https://admin.example.com`).
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const auth: unknown = betterAuth({
  secret: requireAuthSecret(),
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  database: new Pool(databaseConnectionConfig),
  plugins: [
    admin({
      defaultRole: Role.USER,
      adminRoles: [Role.ADMIN],
    }),
    openAPI({
      path: '/docs',
    }),
  ],
  trustedOrigins: resolveTrustedOrigins(),
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
    cookies: {
      session_token: {
        name: 'session',
        attributes: {
          httpOnly: true,
          // Default on for production deployments, but explicitly overridable
          // because the default docker-compose stack serves plain HTTP on
          // localhost and a hard `Secure` flag would drop the session cookie
          // there. Set COOKIE_SECURE=true when terminating TLS upstream.
          secure: process.env.COOKIE_SECURE
            ? process.env.COOKIE_SECURE === 'true'
            : process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: 'memory',
    modelName: 'auth-rate-limit',
  },
  emailAndPassword: {
    enabled: true,
  },
  session: {
    freshAge: 10,
    modelName: 'sessions',
  },
  // Deleting users is intentionally disabled: a user row deletion cascades
  // through `workspaces.ownerId` (ON DELETE CASCADE) and would wipe every
  // workspace they own along with all scan data. Admins ban instead.
  // `/delete-user*` (self-service) is blocked too, for the same reason.
  disabledPaths: [
    ...AUTH_IGNORE_ROUTERS,
    '/admin/remove-user',
    '/delete-user',
    '/delete-user/callback',
  ],
  user: {
    modelName: 'users',
    additionalFields: {
      role: {
        type: 'string',
        enum: Role,
        default: Role.USER,
      },
    },
  },
  account: {
    modelName: 'accounts',
  },
  verification: {
    modelName: 'verifications',
  },
});