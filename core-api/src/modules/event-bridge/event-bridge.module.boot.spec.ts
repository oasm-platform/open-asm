import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullMQName, EventBusGroup } from '@/common/enums/enum';
import { EventConsumersService } from './consuming/event-consumers.service';
import { EVENT_SINKS } from './consuming/event-sink';
import { EventBridgeModule, SINKS } from './event-bridge.module';
import { EventBridgeService } from './publishing/event-bridge.service';
import { EventPublishInterceptor } from './publishing/event-publish.interceptor';
import { SUBSCRIPTIONS } from './routing/subscriptions';
import { AuditSink } from './sinks/audit/audit.sink';
import { IntegrationsSink } from './sinks/integrations/integrations.sink';
import { NotificationsSink } from './sinks/notifications/notifications.sink';
import { ProjectionSink } from './sinks/projection/projection.sink';

/**
 * Guards the one wiring mistake that is invisible everywhere else: a lane
 * declared in `SUBSCRIPTIONS` and the enum, but whose sink never reaches the
 * consumer runtime.
 *
 * Such a bug passes every unit test — each sink spec builds its own consumer —
 * and then the lane simply never consumes in production, with no error
 * anywhere. Reading the module's own metadata catches it, and unlike compiling
 * the module it does not drag in `IntegrationsModule`'s entire repository graph
 * just to assert a provider list.
 *
 * Run: task api:test:one SPEC=src/modules/event-bridge/event-bridge.module.boot.spec.ts
 */
describe('EventBridgeModule wiring', () => {
  const providers = (): unknown[] =>
    (Reflect.getMetadata('providers', EventBridgeModule) ?? []) as unknown[];

  const exports = (): unknown[] =>
    (Reflect.getMetadata('exports', EventBridgeModule) ?? []) as unknown[];

  const providerFor = (token: unknown) =>
    providers().find(
      (provider): provider is Record<string, unknown> =>
        typeof provider === 'object' &&
        provider !== null &&
        (provider as { provide?: unknown }).provide === token,
    );

  const allSinks = [AuditSink, ProjectionSink, NotificationsSink, IntegrationsSink];

  it('registers every sink as a provider', () => {
    for (const sink of allSinks) {
      expect(providers()).toContain(sink);
    }
  });

  it('hands every sink to the consumer runtime', () => {
    // A sink registered as a provider but missing from EVENT_SINKS would boot
    // cleanly and never consume.
    const sinksProvider = providerFor(EVENT_SINKS);
    expect(sinksProvider?.inject).toEqual(expect.arrayContaining(allSinks));
    expect(SINKS).toHaveLength(allSinks.length);
    expect(providers()).toContain(EventConsumersService);
  });

  it('runs exactly one sink per declared lane', () => {
    // Derived from the enum: adding a lane without a sink (or a sink without a
    // subscription) fails here instead of in production. Dependencies are
    // never touched by the getters read here, so dummies suffice.
    const dummy = {} as never;
    const groups = [
      new AuditSink(dummy),
      new ProjectionSink(),
      new NotificationsSink(dummy, dummy, dummy, dummy),
      new IntegrationsSink(dummy, dummy, dummy),
    ].map((sink) => sink.group);

    expect(groups.sort()).toEqual(Object.values(EventBusGroup).sort());
    expect(Object.keys(SUBSCRIPTIONS).sort()).toEqual(
      Object.values(EventBusGroup).sort(),
    );
  });

  it('exports the bridge, the catalog token and the direct notification path', () => {
    expect(exports()).toContain(EventBridgeService);
    expect(exports()).toContain(NotificationsSink);
  });

  it('registers the publish interceptor as the only global enhancer', () => {
    const enhancers = providers().filter(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        (provider as { provide?: unknown }).provide === APP_INTERCEPTOR,
    );
    expect(enhancers).toHaveLength(1);
    expect((enhancers[0] as { useClass: unknown }).useClass).toBe(
      EventPublishInterceptor,
    );
  });

  it('registers no email lane, because there is no transport to send through', () => {
    // A group with no provider behind it either never consumes or drops every
    // event it claims; both are worse than the lane not existing.
    const emailProviders = providers().filter((provider) =>
      String(
        typeof provider === 'object' && provider !== null && 'provide' in provider
          ? (provider).provide
          : provider,
      )
        .toLowerCase()
        .includes('email'),
    );
    expect(emailProviders).toEqual([]);
  });

  it('does not register the removed BullMQ notification queue', () => {
    // Workspace notifications moved onto a consumer group; leaving the queue
    // would be a second producer path writing the same rows.
    expect(BullMQName).not.toHaveProperty('NOTIFICATION');
  });
});
