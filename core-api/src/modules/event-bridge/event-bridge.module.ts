import { ServicesModule } from '@/services/services.module';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationRecipient } from '../notifications/entities/notification-recipient.entity';
import { EVENT_CATALOG, EVENT_CATALOG_TOKEN } from '../connectors/event';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuditSinkService } from './audit-sink.service';
import { EventBridgeService } from './event-bridge.service';
import { EventPublishInterceptor } from './event-publish.interceptor';

import { IntegrationsSinkService } from './integrations.sink.service';
import { NotificationsSinkService } from './notifications.sink.service';
import { ProjectionSinkService } from './projection.sink.service';

/**
 * Bridges domain events onto a Redis Stream and consumes it back.
 *
 * `@Global()` for the same reason `AuditModule` is: the bridge is published FROM
 * a dozen modules (controllers, job lifecycle, worker lifecycle, schedulers) and
 * imported INTO none of them. Making it global keeps every emit site a one-line
 * DI of `EventBridgeService` instead of an import edit in that module's
 * `imports` array.
 *
 * Producer and consumers live in one module because they share the stream key
 * and the group names — splitting them would only move that coupling to a
 * second import.
 *
 * The consumer groups are separate providers, not one worker with several
 * handlers, because a consumer group is Redis-side state with its OWN read
 * position: each lane must advance independently or the slowest one holds back
 * the audit trail. What they share is the loop itself (`StreamConsumerService`),
 * so they cannot drift in their retry or dead-letter behaviour.
 *
 * `IntegrationsModule` is imported for the outbound lanes (decrypting a
 * workspace's integration config); `Notification`/`NotificationRecipient` are
 * registered here because the notifications lane materializes those rows.
 */
@Global()
@Module({
  imports: [
    ServicesModule,
    IntegrationsModule,
    TypeOrmModule.forFeature([
      AuditEvent,
      Notification,
      NotificationRecipient,
      User,
    ]),
  ],
  providers: [
    EventBridgeService,
    AuditSinkService,
    ProjectionSinkService,
    NotificationsSinkService,
    IntegrationsSinkService,
    {
      provide: EVENT_CATALOG_TOKEN,
      useValue: EVENT_CATALOG,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EventPublishInterceptor,
    },
  ],
  exports: [
    EventBridgeService,
    AuditSinkService,
    ProjectionSinkService,
    NotificationsSinkService,
    IntegrationsSinkService,
    EVENT_CATALOG_TOKEN,
  ],
})
export class EventBridgeModule {}