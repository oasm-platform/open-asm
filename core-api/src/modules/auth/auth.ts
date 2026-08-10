import { AUTH_IGNORE_ROUTERS } from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import { databaseConnectionConfig } from '@/database/database-config';
import { betterAuth } from 'better-auth';
import { admin, openAPI } from 'better-auth/plugins';
import { randomUUID } from 'crypto';
import 'dotenv/config';
import { Pool } from 'pg';

export const auth: unknown = betterAuth({
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
  trustedOrigins: ['*'],
  advanced: {
    database: {
      generateId: () => randomUUID(),
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
