import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/modules/auth/entities/user.entity';
import { Integration } from './entities/integration.entity';
import { TelegramConnect } from './entities/telegram-connect.entity';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { TelegramConnectService } from './telegram-connect.service';
import { TelegramWebhookService } from './telegram-webhook.service';
import { TelegramPollingService } from './telegram-polling.service';

@Module({
  imports: [TypeOrmModule.forFeature([Integration, TelegramConnect, User])],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    TelegramConnectService,
    TelegramWebhookService,
    TelegramPollingService,
  ],
  exports: [IntegrationsService, TelegramConnectService],
})
export class IntegrationsModule {}
