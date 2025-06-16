import { Pool } from 'pg';
const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_PORT, DB_NAME, DB_SSL } =
  process.env;

export const databaseConnectionConfig = {
  host: DB_HOST,
  user: DB_USERNAME,
  username: DB_USERNAME,
  password: DB_PASSWORD,
  port: parseInt(DB_PORT || '5432', 10),
  database: DB_NAME,
  ssl: Boolean(DB_SSL === 'true'),
};

export const database = new Pool(databaseConnectionConfig);
