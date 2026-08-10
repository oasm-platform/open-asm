import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/modules/auth/entities/user.entity';
import { Integration } from './entities/integration.entity';
import { TelegramConnect } from './entities/telegram-connect.entity';
import { IntegrationSyncProcessor } from './integration-sync.processor';
import { IntegrationsController } from './integrations.controller';
import { IntegrationSyncService } from './integrations-sync.service';
import { IntegrationsService } from './integrations.service';
import { TelegramConnectService } from './telegram-connect.service';
import { TelegramWebhookService } from './telegram-webhook.service';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Integration, TelegramConnect, User]),
    BullModule.registerQueue({
      name: BullMQName.INTEGRATION_SYNC_SCHEDULE,
    }),
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    IntegrationSyncService,
    IntegrationSyncProcessor,
    TelegramConnectService,
    TelegramWebhookService,
    TelegramPollingService,
    TelegramBotService,
  ],
  exports: [IntegrationsService, TelegramConnectService],
})
export class IntegrationsModule {}
