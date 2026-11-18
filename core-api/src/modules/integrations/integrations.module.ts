import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/modules/auth/entities/user.entity';
import { Integration } from './entities/integration.entity';
import { TelegramConnect } from './entities/telegram-connect.entity';
import { IntegrationSyncProcessor } from './integration-sync.processor';
import { IntegrationsController } from './integrations.controller';
import { AwsSsoService } from './connectors/aws/aws-sso.service';
import { IntegrationConfigModule } from './integration-config.module';
import { IntegrationSyncService } from './integrations-sync.service';
import { IntegrationsService } from './integrations.service';
import { RepositorySyncProcessor } from './repository-sync.processor';
import { RepositorySyncService } from './repository-sync.service';
import { TelegramConnectService } from './telegram-connect.service';
import { TelegramWebhookService } from './telegram-webhook.service';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramBotService } from './telegram-bot.service';
import { AssetsModule } from '../assets/assets.module';
import { TargetsModule } from '../targets/targets.module';
import { DataAdapterModule } from '../data-adapter/data-adapter.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Integration, TelegramConnect, User]),
    IntegrationConfigModule,
    AssetsModule,
    BullModule.registerQueue({
      name: BullMQName.INTEGRATION_SYNC_SCHEDULE,
      defaultJobOptions: {
        // Failed sync jobs are dropped, never accumulated (manual jobs also
        // set removeOnComplete so completed runs vanish).
        removeOnFail: true,
      },
    }),
    BullModule.registerQueue({
      name: BullMQName.REPOSITORY_SYNC,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    }),
    TargetsModule,
    DataAdapterModule,
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    IntegrationSyncService,
    IntegrationSyncProcessor,
    RepositorySyncService,
    RepositorySyncProcessor,
    TelegramConnectService,
    TelegramWebhookService,
    TelegramPollingService,
    TelegramBotService,
    AwsSsoService,
  ],
  exports: [IntegrationsService, TelegramConnectService],
})
export class IntegrationsModule {}
