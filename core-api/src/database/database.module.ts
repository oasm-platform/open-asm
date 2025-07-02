import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConnectionConfig } from './database-config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      entities: [__dirname + '/../**/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/../**/**/*.migration{.ts,.js}'],
      ...databaseConnectionConfig,
      migrationsRun: true,
      synchronize: false,
    }),
  ],
})
export class DatabaseModule {}
