import { ServicesModule } from '@/services/services.module';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { NotificationRecipient } from '../notifications/entities/notification-recipient.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { EventConsumersService } from './consuming/event-consumers.service';
import { EVENT_CATALOG, EVENT_CATALOG_TOKEN } from './contracts/event-catalog';
import { EventBridgeService } from './publishing/event-bridge.service';
import { EventPublishInterceptor } from './publishing/event-publish.interceptor';
import { AuditSink } from './sinks/audit/audit.sink';
import { NotificationsSink } from './sinks/notifications/notifications.sink';
import { ProjectionSink } from './sinks/projection/projection.sink';

/**
 * The lanes this module owns. The integrations, projects and issues lanes
 * are `@EventLane()` providers of their own modules; `EventConsumersService`
 * discovers all of them at boot and refuses to start unless every
 * `EventBusGroup` has exactly one.
 */
export const SINKS = [AuditSink, ProjectionSink, NotificationsSink] as const;

/**
 * The event bus: publish domain events onto a Redis Stream and consume them
 * back through one consumer group per lane.
 *
 *   publishing/   producer side: `EventBridgeService`, `@PublishEvent` + its
 *                 interceptor, secret redaction
 *   contracts/    the wire contract: catalog, envelope, payload shapes
 *   routing/      per-event policy and per-lane domain subscriptions
 *   transport/    stream entry encode/decode
 *   consuming/    the consumer-group runtime: lane discovery, loop, retry,
 *                 DLQ, idempotency
 *   sinks/        the lanes that belong to the bus itself (audit, projection,
 *                 notifications)
 *
 * `@Global()` because the bridge is published FROM a dozen modules and
 * imported INTO none of them: every emit site stays a one-line DI of
 * `EventBridgeService`. It imports no domain module; the entities are
 * registered for the audit and notifications lanes that materialize them.
 */
@Global()
@Module({
  imports: [
    ServicesModule,
    DiscoveryModule,
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
    EventConsumersService,
  ],
  exports: [EventBridgeService, EVENT_CATALOG_TOKEN, NotificationsSink],
})
export class EventBridgeModule {}
