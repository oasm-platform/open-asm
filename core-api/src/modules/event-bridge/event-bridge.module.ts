import { ServicesModule } from '@/services/services.module';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationRecipient } from '../notifications/entities/notification-recipient.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { EventConsumersService } from './consuming/event-consumers.service';
import { EVENT_SINKS, type EventSink } from './consuming/event-sink';
import { EVENT_CATALOG, EVENT_CATALOG_TOKEN } from './contracts/event-catalog';
import { EventBridgeService } from './publishing/event-bridge.service';
import { EventPublishInterceptor } from './publishing/event-publish.interceptor';
import { AuditSink } from './sinks/audit/audit.sink';
import { IntegrationsSink } from './sinks/integrations/integrations.sink';
import { NotificationsSink } from './sinks/notifications/notifications.sink';
import { ProjectionSink } from './sinks/projection/projection.sink';

/**
 * Every lane, one per `EventBusGroup`. Adding a lane = a sink class here plus
 * its `SUBSCRIPTIONS` entry; the consumer runtime picks it up from
 * `EVENT_SINKS`.
 */
export const SINKS = [
  AuditSink,
  ProjectionSink,
  NotificationsSink,
  IntegrationsSink,
] as const;

/**
 * The event bus: publish domain events onto a Redis Stream and consume them
 * back through one consumer group per lane.
 *
 *   publishing/   producer side — `EventBridgeService`, `@PublishEvent` + its
 *                 interceptor, secret redaction
 *   contracts/    the wire contract — catalog, envelope, payload shapes
 *   routing/      per-event policy and per-lane domain subscriptions
 *   transport/    stream entry encode/decode
 *   consuming/    the consumer-group runtime — loop, retry, DLQ, idempotency
 *   sinks/        what each lane does with an event
 *
 * `@Global()` because the bridge is published FROM a dozen modules and
 * imported INTO none of them: every emit site stays a one-line DI of
 * `EventBridgeService`.
 *
 * `IntegrationsModule` is imported for the outbound lane (decrypting a
 * workspace's integration config); the entities are registered for the audit
 * and notifications lanes that materialize them.
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
    // Publishing
    EventBridgeService,
    { provide: EVENT_CATALOG_TOKEN, useValue: EVENT_CATALOG },
    { provide: APP_INTERCEPTOR, useClass: EventPublishInterceptor },

    // Consuming
    ...SINKS,
    {
      provide: EVENT_SINKS,
      useFactory: (...sinks: EventSink[]) => sinks,
      inject: [...SINKS],
    },
    EventConsumersService,
  ],
  exports: [EventBridgeService, EVENT_CATALOG_TOKEN, NotificationsSink],
})
export class EventBridgeModule {}
