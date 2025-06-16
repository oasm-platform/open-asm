import { betterAuth } from 'better-auth';
import { openAPI } from 'better-auth/plugins';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { databaseConnectionConfig } from 'src/database/database-config';

export const auth = betterAuth({
  database: new Pool(databaseConnectionConfig),
  plugins: [
    openAPI({
      path: '/docs',
    }),
  ],
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
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
