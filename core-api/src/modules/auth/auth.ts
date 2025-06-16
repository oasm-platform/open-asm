import { betterAuth } from 'better-auth';
import { openAPI } from 'better-auth/plugins';
import { Pool } from 'pg';
import { Role } from 'src/common/enums/enum';
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
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: Role.USER,
      },
    },
  },
  account: {
    modelName: 'accounts',
  },
  verification: {
    modelName: 'verifications',
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
});
