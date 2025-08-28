import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { CombineModule } from './modules/combine.module';
import { StorageModule } from './modules/storage/storage.module'; // assuming this is the correct import path
import { ServicesModule } from './services/services.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    EventEmitterModule.forRoot({ wildcard: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CombineModule,
    StorageModule,
    ServicesModule,
  ],
})
export class AppModule {}
