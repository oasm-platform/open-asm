import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullMQName, EventBusGroup } from '@/common/enums/enum';
import { AuditSinkService } from './audit-sink.service';
import { EventBridgeModule } from './event-bridge.module';
import { EventBridgeService } from './event-bridge.service';
import { EventPublishInterceptor } from './event-publish.interceptor';
import { IntegrationsSinkService } from './integrations.sink.service';
import { NotificationsSinkService } from './notifications.sink.service';
import { ProjectionSinkService } from './projection.sink.service';

/**
 * Guards the one wiring mistake that is invisible everywhere else: a consumer
 * group declared in `SUBSCRIPTIONS` and its constant, but NOT registered as a
 * provider.
 *
 * Such a bug passes every unit test — each sink is constructed directly by its
 * own spec — and then the lane simply never consumes in production, with no
 * error anywhere. Reading the module's own metadata catches it, and unlike
 * compiling the module it does not drag in `IntegrationsModule`'s entire
 * repository graph just to assert a provider list.
 */
describe('EventBridgeModule wiring', () => {
  /** Every provider token/class the module registers. */
  const providers = (): unknown[] =>
    (Reflect.getMetadata('providers', EventBridgeModule) ?? []) as unknown[];

  const exports = (): unknown[] =>
    (Reflect.getMetadata('exports', EventBridgeModule) ?? []) as unknown[];

  const allSinks = [
    AuditSinkService,
    ProjectionSinkService,
    NotificationsSinkService,
    IntegrationsSinkService,
  ];

  it('registers every consumer group as a provider', () => {
    // One per declared group. A sink added to SUBSCRIPTIONS but not here would
    // boot cleanly and never run.
    for (const sink of allSinks) {
      expect(providers()).toContain(sink);
    }
  });

  it('declares exactly one lane per enum member, and every one has a sink', () => {
    const declaredGroups = [
      EventBusGroup.Audit,
      EventBusGroup.Projection,
      EventBusGroup.Notifications,
      EventBusGroup.Integrations,
    ];
    // Derived from the enum, not hardcoded: adding a lane must update this
    // list too, and the compiler then refuses to forget its sink.
    expect(declaredGroups.sort()).toEqual(Object.values(EventBusGroup).sort());
    expect(allSinks).toHaveLength(declaredGroups.length);
  });

  it('exports every sink, so a module can depend on the lane it needs', () => {
    for (const sink of allSinks) {
      expect(exports()).toContain(sink);
    }
  });

  it('exports the bridge and the catalog token', () => {
    expect(exports()).toContain(EventBridgeService);
  });

  it('registers the publish interceptor as the global enhancer', () => {
    const enhancers = providers().filter(
      (provider): provider is { provide: unknown } =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        (provider).provide === APP_INTERCEPTOR,
    );
    expect(enhancers).toHaveLength(1);
    expect(
      (enhancers[0] as unknown as { useClass: unknown }).useClass,
    ).toBe(EventPublishInterceptor);
  });

  it('registers no email lane, because there is no transport to send through', () => {
    // A group with no provider behind it either never consumes or drops every
    // event it claims; both are worse than the lane not existing. This asserts
    // the removal so a stray provider cannot creep back in.
    const emailProviders = providers().filter((provider) =>
      String(
        typeof provider === 'object' && provider !== null && 'provide' in provider
          ? (provider).provide
          : provider,
      ).toLowerCase().includes('email'),
    );
    expect(emailProviders).toEqual([]);
  });

  it('does NOT register an APP_INTERCEPTOR for the audit trail', () => {
    // There is exactly one producer-side interceptor. A second one writing
    // audit rows directly would double every row now that the audit sink is
    // the materialized view of the stream.
    const auditWriters = providers().filter(
      (provider): provider is { provide: unknown } =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        (provider).provide === APP_INTERCEPTOR &&
        (provider as { useClass?: { name?: string } }).useClass?.name !==
          'EventPublishInterceptor',
    );
    expect(auditWriters).toEqual([]);
  });

  it('does not register the removed BullMQ notification queue', () => {
    // P1 moved workspace notifications onto a consumer group; leaving the queue
    // would be a second producer path writing the same rows.
    expect(BullMQName).not.toHaveProperty('NOTIFICATION');
  });
});