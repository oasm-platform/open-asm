import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from 'src/modules/auth/entities/account.entity';
import { Session } from 'src/modules/auth/entities/session.entity';
import { User } from 'src/modules/auth/entities/user.entity';
import { Verification } from 'src/modules/auth/entities/verification.entity';
import { databaseConnectionConfig } from './database-config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      entities: [Account, User, Session, Verification],
      synchronize: true,
      ...databaseConnectionConfig,
    }),
  ],
})
export class DatabaseModule {}
