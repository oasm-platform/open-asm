import { BullMQName, NotificationStatus } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { RedisService } from '@/services/redis/redis.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { In, Repository } from 'typeorm';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { NotificationRecipient } from '../entities/notification-recipient.entity';
import { Notification } from '../entities/notification.entity';

@Processor(BullMQName.NOTIFICATION)
export class NotificationsConsumer extends WorkerHost {
  constructor(
    private readonly redisService: RedisService,
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
    const { recipients, scope, metadata, type } = job.data;
    const notification = await this.notificationRepo.save({
      scope,
      type,
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
  }
}
