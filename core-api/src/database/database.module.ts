import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConnectionConfig } from './database-config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      entities: [__dirname + '/../**/**/*.entity{.ts,.js}'],
      ...databaseConnectionConfig,
      synchronize: true,
    }),
  ],
})
export class DatabaseModule {}
