// Trigger rebuild to update OpenAPI spec
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';
import { icuFormatter } from './utils/icu-formatter';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { CombineModule } from './modules/combine.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './modules/storage/storage.module';
import { McpServerModule } from './mcp/mcp.module';
import { ServicesModule } from './services/services.module';
import { EventBridgeModule } from './modules/event-bridge/event-bridge.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    EventEmitterModule.forRoot({ wildcard: true }),
    ScheduleModule.forRoot(),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      formatter: icuFormatter,
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        // Hot reload is a dev-server affordance. Every other mode (test, and
        // anything else non-development) would leave a chokidar watcher
        // holding the event loop open, which is what makes Jest report
        // "A worker process has failed to exit gracefully".
        watch: process.env.NODE_ENV === 'development',
      },
      logging: process.env.NODE_ENV !== 'production',
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-custom-lang']),
      ],
    }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    AuditModule,
    EventBridgeModule,
    CombineModule,
    NotificationsModule,
    StorageModule,
    ServicesModule,
    McpServerModule,
  ],
})
export class AppModule {}
