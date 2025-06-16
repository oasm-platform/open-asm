import { betterAuth } from 'better-auth';
import { openAPI } from 'better-auth/plugins';
import { Pool } from 'pg';

const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_PORT, DB_NAME, DB_SSL } =
  process.env;

const database = new Pool({
  host: DB_HOST,
  user: DB_USERNAME,
  password: DB_PASSWORD,
  port: parseInt(DB_PORT || '5432', 10),
  database: DB_NAME,
  ssl: Boolean(DB_SSL === 'true'),
});

export const auth = betterAuth({
  database,
  plugins: [openAPI()],
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
        defaultValue: 'user',
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
