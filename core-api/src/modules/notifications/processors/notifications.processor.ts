import {
  BullMQName,
  IntegrationType,
  NotificationStatus,
} from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { RedisService } from '@/services/redis/redis.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { I18nService } from 'nestjs-i18n';
import { In, Repository } from 'typeorm';
import { runConnector } from '../../integrations/connectors/connector.factory';
import { IntegrationsService } from '../../integrations/integrations.service';
import { decryptSensitiveConfigFields } from '../../integrations/validators/integration.validator';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { NotificationRecipient } from '../entities/notification-recipient.entity';
import { Notification } from '../entities/notification.entity';

@Processor(BullMQName.NOTIFICATION)
export class NotificationsConsumer extends WorkerHost {
  constructor(
    private readonly redisService: RedisService,
    private readonly integrationsService: IntegrationsService,
    private readonly i18n: I18nService,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRecipient)
    private notificationRecipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {
    super();
  }

  async process(job: Job<CreateNotificationDto>): Promise<void> {
    const { recipients, scope, metadata, type, workspaceId } = job.data;

    const notification = await this.notificationRepo.save({
      scope,
      type,
      workspace: { id: workspaceId },
      metadata,
    });

    const users = await this.userRepo.findBy({
      id: In(recipients),
    });

    const recipientEntities: Partial<NotificationRecipient>[] = [];

    for (const user of users) {
      recipientEntities.push({
        notificationId: notification.id,
        userId: user.id,
        status: NotificationStatus.SENT,
      });
    }

    if (recipientEntities.length > 0) {
      await this.notificationRecipientRepo.save(recipientEntities);
      for (const user of users) {
        await this.redisService.publisher.publish(
          `notification:${user.id}`,
          JSON.stringify({
            notificationId: notification.id,
            scope,
            metadata,
          }),
        );
      }
    }

    // --- Push notification text to connected integrations ---
    if (workspaceId) {
      await this.pushToIntegrations(type, metadata, workspaceId);
    }
  }

  /**
   * Translates the notification via i18n (lang=en) and pushes to every
   * connected NOTIFICATION integration in the workspace.
   * Failures are logged but never thrown — integrations are best-effort.
   */
  private async pushToIntegrations(
    type: string,
    metadata: Record<string, string> | undefined,
    workspaceId: string,
  ): Promise<void> {
    const logger = new Logger(NotificationsConsumer.name);

    try {
      const message = this.i18n.translate<string>(`notification.${type}`, {
        lang: 'en',
        args: metadata ?? {},
      }) as string;

      const integrations =
        await this.integrationsService.getIntegrationEntitiesByCategory(
          workspaceId,
          IntegrationType.NOTIFICATION,
        );

      if (integrations.length === 0) return;

      const results = await Promise.allSettled(
        integrations.map(async (integration) => {
          const decryptedConfig = decryptSensitiveConfigFields(
            integration.config,
          );
          await runConnector(integration.appType, integration.category, {
            ...decryptedConfig,
            text: message,
          });
        }),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          logger.error(`Integration push failed: ${result.reason}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to push to integrations: ${error}`);
    }
  }
}
