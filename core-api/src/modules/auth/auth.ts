import { betterAuth } from 'better-auth';
import { admin, openAPI } from 'better-auth/plugins';
import { randomUUID } from 'crypto';
import 'dotenv/config';
import { Pool } from 'pg';
import { DEFAULT_ADMIN_ID } from 'src/common/constants/app.constants';
import { Role } from 'src/common/enums/enum';
import { databaseConnectionConfig } from 'src/database/database-config';

export const auth = betterAuth({
  database: new Pool(databaseConnectionConfig),
  plugins: [
    admin({
      defaultRole: Role.USER,
      adminRoles: [Role.ADMIN],
      adminUserIds: [DEFAULT_ADMIN_ID],
    }),
    openAPI({
      path: '/docs',
    }),
  ],
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
    cookies: {
      session_token: {
        name: 'session',
        attributes: {
          httpOnly: true,
          secure: true,
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 5,
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
  user: {
    modelName: 'users',
  },
  account: {
    modelName: 'accounts',
  },
  verification: {
    modelName: 'verifications',
  },
});
