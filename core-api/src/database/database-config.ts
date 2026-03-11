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

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  ...databaseConnectionConfig,
  synchronize: false,
  entities: [__dirname + '/../**/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  migrationsRun: true,
  migrationsTableName: 'migrations',
};

export const AppDataSource = new DataSource(dataSourceOptions);
