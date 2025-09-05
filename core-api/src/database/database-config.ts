import { Pool } from 'pg';
const {
  POSTGRES_HOST,
  POSTGRES_USERNAME,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_DB,
  POSTGRES_SSL,
} = process.env;

export const databaseConnectionConfig = {
  host: POSTGRES_HOST,
  user: POSTGRES_USERNAME,
  username: POSTGRES_USERNAME,
  password: POSTGRES_PASSWORD,
  port: parseInt(POSTGRES_PORT || '5432', 5432),
  database: POSTGRES_DB,
  ssl: Boolean(POSTGRES_SSL === 'true'),
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
export const database = new Pool(databaseConnectionConfig);
