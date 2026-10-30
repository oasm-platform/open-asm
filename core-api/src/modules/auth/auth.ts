import { parseTrustedProxies } from '@/common/config/trusted-proxies';
import {
  AUTH_IGNORE_ROUTERS,
  PENDING_APPROVAL_REASON,
} from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import { databaseConnectionConfig } from '@/database/database-config';
import { betterAuth, type Auth } from 'better-auth';
import { admin, openAPI } from 'better-auth/plugins';
import { randomUUID } from 'crypto';
import 'dotenv/config';
import { Pool } from 'pg';
import { resolveAuthSecret } from './auth-env';
import { logBetterAuth } from './auth-logger';
import { createSessionRedis, createSessionStorage } from './session-storage';

export const auth: unknown = betterAuth({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  database: new Pool(databaseConnectionConfig),
  // Public URL of the console, shared with the Telegram webhook. Unset (local
  // development), links such as email verification use the request's host.
  baseURL: process.env.BASE_URL || undefined,
  // Signs session cookies and email verification links; required when deployed
  secret: resolveAuthSecret(),
  logger: { log: logBetterAuth },
  // Sessions are resolved from Redis first; the database is only queried on a
  // cache miss. See session-storage.ts. The connection is its own: this
  // instance is built at import time, outside Nest DI, before RedisService.
  secondaryStorage: createSessionStorage(
    createSessionRedis(process.env.REDIS_URL),
    () => (auth as Auth).$context,
  ),
  plugins: [
    admin({
      defaultRole: Role.USER,
      adminRoles: [Role.ADMIN],
      // Shown to banned accounts and to sign-ups still pending approval alike
      bannedUserMessage:
        'Your account is not active. Contact your administrator.',
    }),
    openAPI({
      path: '/docs',
    }),
  ],
  trustedOrigins: ['*'],
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
    // Behind several proxies X-Forwarded-For has more than one hop; without
    // trusted proxies Better Auth cannot resolve the client and rate-limits
    // every user in one shared bucket.
    ipAddress: {
      trustedProxies: parseTrustedProxies(process.env.TRUSTED_PROXIES),
    },
    cookies: {
      session_token: {
        name: 'session',
        attributes: {
          httpOnly: true,
          // secure: true,
          // sameSite: 'strict',
        },
      },
    },
  },
  rateLimit: {
    // The limiter is 100 req / 60s in-memory. An e2e suite that signs up users
    // and fires auth guard matrices trips it and then fails on rate limit
    // instead of on the behaviour under test. Only the e2e harness sets this
    // flag (core-api/test/pin-test-env.ts); no deployed environment does.
    enabled: process.env.AUTH_RATE_LIMIT_DISABLED !== 'true',
    window: 60,
    max: 100,
    storage: 'memory',
    modelName: 'auth-rate-limit',
  },
  emailAndPassword: {
    enabled: true,
    // A public sign-up starts pending approval, so it gets no session. With
    // this off better-auth also answers a taken email like a new one.
    autoSignIn: false,
  },
  // A public sign-up gets a link to confirm its email; an admin can approve
  // the account once it is confirmed (PendingApprovalHook). The sender is set
  // at boot by MailService, which uses the mail server from system settings.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    expiresIn: 24 * 60 * 60,
  },
  databaseHooks: {
    user: {
      create: {
        // Accounts made through public sign-up wait for an admin: they start
        // banned with PENDING_APPROVAL_REASON, and approving is unbanning.
        // Only HTTP calls carry a request, so the first-admin bootstrap
        // (`auth.api.signUpEmail`) and `/admin/create-user` are not affected.
        before: (user, ctx) =>
          Promise.resolve(
            ctx?.path === '/sign-up/email' && ctx.request
              ? {
                  data: {
                    ...user,
                    banned: true,
                    banReason: PENDING_APPROVAL_REASON,
                  },
                }
              : undefined,
          ),
      },
    },
  },
  // Filled at boot by AuthModule from @Hook() providers (e.g. SignUpHook);
  // without this object AuthModule skips hook setup.
  hooks: {},
  session: {
    freshAge: 10,
    modelName: 'sessions',
    // Keep writing sessions to the database alongside Redis, so the database
    // stays the source of truth and a cache miss can fall back to it.
    storeSessionInDatabase: true,
  },
  // Deleting users is intentionally disabled: a user row deletion cascades
  // through `workspaces.ownerId` (ON DELETE CASCADE) and would wipe every
  // workspace they own along with all scan data. Admins ban instead.
  // `/delete-user*` (self-service) is blocked too, for the same reason.
  // `/admin/list-users` and `/admin/get-user` are replaced by GET /api/admin/users
  // and GET /api/admin/users/:id.
  // Public sign-up (`/sign-up/email`) is not listed: SignUpHook opens or closes
  // it from the `auth.allowSignUp` system setting (closed by default), and the
  // accounts it makes wait for approval (`databaseHooks` below). Admins create
  // accounts with `/admin/create-user`.
  disabledPaths: [
    ...AUTH_IGNORE_ROUTERS,
    '/admin/remove-user',
    '/admin/list-users',
    '/admin/get-user',
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
    // With secondaryStorage set, Better Auth would move verifications to Redis
    // too. The session storage ignores them, so they stay database-only.
    storeInDatabase: true,
  },
});
