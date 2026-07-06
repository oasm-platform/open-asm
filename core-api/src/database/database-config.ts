import 'dotenv/config';
import type { DataSourceOptions } from 'typeorm';
import { DataSource } from 'typeorm';

const {
  POSTGRES_HOST,
  POSTGRES_USERNAME,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_DB,
  POSTGRES_SSL,
  NODE_ENV,
  REDIS_URL,
} = process.env;

export const databaseConnectionConfig = {
  host: POSTGRES_HOST,
  user: POSTGRES_USERNAME,
  username: POSTGRES_USERNAME,
  password: POSTGRES_PASSWORD,
  port: parseInt(POSTGRES_PORT || '5432', 10),
  database: POSTGRES_DB,
  ssl: POSTGRES_SSL === 'true',
};

function parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.replace('/', ''), 10) : undefined,
  };
}

const redisOptions = REDIS_URL ? parseRedisUrl(REDIS_URL) : { host: 'localhost', port: 6379 };

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  ...databaseConnectionConfig,
  synchronize: false,
  entities: [__dirname + '/../**/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  migrationsRun: NODE_ENV === 'development',
  migrationsTableName: 'migrations',
  logger: 'advanced-console',
  cache: {
    type: 'ioredis',
    options: redisOptions,
    duration: 5000,
    ignoreErrors: true,
  },
};

export const AppDataSource = new DataSource(dataSourceOptions);
