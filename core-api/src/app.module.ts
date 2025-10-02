import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { McpModule, McpTransportType } from '@rekog/mcp-nest';
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
    McpModule.forRoot({
      name: 'oasm-server',
      instructions: 'OpenASM Server',
      version: '1.0.0',
      transport: McpTransportType.SSE,
    }),
    EventEmitterModule.forRoot({ wildcard: true }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    CombineModule,
    StorageModule,
    ServicesModule,
  ],
})
export class AppModule { }
