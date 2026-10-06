import { ServicesModule } from '@/services/services.module';
import { Global, Module } from '@nestjs/common';
import { EVENT_CATALOG, EVENT_CATALOG_TOKEN } from '../connectors/event';
import { EventBridgeService } from './event-bridge.service';

/**
 * Bridges domain events onto a Redis Stream.
 *
 * `@Global()` for the same reason `AuditModule` is: the bridge is published
 * FROM a dozen modules (audit interceptor, job lifecycle, worker lifecycle,
 * schedulers) and imported INTO none of them. Making it global keeps every
 * emit site a one-line DI of `EventBridgeService` instead of an import edit
 * in that module's `imports` array.
 *
 * The catalog is exported as a provider rather than imported directly by
 * consumers, so the event surface is a resolved dependency — a consumer that
 * asks for the catalog gets exactly the one this module registered.
 */
@Global()
@Module({
  imports: [ServicesModule],
  providers: [
    EventBridgeService,
    {
      provide: EVENT_CATALOG_TOKEN,
      useValue: EVENT_CATALOG,
    },
  ],
  exports: [EventBridgeService, EVENT_CATALOG_TOKEN],
})
export class EventBridgeModule {}
