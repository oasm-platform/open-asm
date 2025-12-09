import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { GrpcClientModule } from './grpc-client/grpc-client.module';
import { McpServerModule } from './mcp/mcp.module';
import { CombineModule } from './modules/combine.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './modules/storage/storage.module';
import { ServicesModule } from './services/services.module';
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import * as path from 'path';

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
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: true,
      },
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
    GrpcClientModule,
    CombineModule,
    NotificationsModule,
    StorageModule,
    ServicesModule,
    McpServerModule,
  ],
})
export class AppModule {}
