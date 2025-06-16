import { betterAuth } from 'better-auth';
import { openAPI } from 'better-auth/plugins';
import { Pool } from 'pg';
import { databaseConnectionConfig } from 'src/database/database-config';

export const auth = betterAuth({
  database: new Pool(databaseConnectionConfig),
  plugins: [
    openAPI({
      path: '/docs',
    }),
  ],
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
