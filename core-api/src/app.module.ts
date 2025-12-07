import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { GrpcClientModule } from './grpc-client/grpc-client.module';
import { McpServerModule } from './mcp/mcp.module';
import { CombineModule } from './modules/combine.module';
import { StorageModule } from './modules/storage/storage.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
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
    GrpcClientModule,
    CombineModule,
    StorageModule,
    ServicesModule,
    McpServerModule,
  ],
})
export class AppModule {}
