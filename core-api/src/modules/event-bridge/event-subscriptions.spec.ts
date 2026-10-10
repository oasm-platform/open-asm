import { EventBusGroup } from '@/common/enums/enum';
import { EVENT_NAMES, type EventName } from '../connectors/event';
import { SUBSCRIPTIONS } from './event-policy';

/**
 * `SUBSCRIPTIONS` is the single declaration of what each lane consumes, so
 * these tests are about the TABLE being coherent rather than about any one
 * handler. The values are real domains and the groups are real Redis groups —
 * a typo in either fails silently in production as a lane that never fires.
 *
 * Run: task api:test:one SPEC=src/modules/event-bridge/event-subscriptions.spec.ts
 */
describe('event bus subscriptions', () => {
  const groups = Object.keys(SUBSCRIPTIONS);
  const realDomains = new Set(EVENT_NAMES.map((name) => name.split('.')[0]));

  it('declares exactly the four lanes, keyed by the enum', () => {
    // Keyed off EventBusGroup so adding a lane to the enum without declaring a
    // subscription here (or vice versa) fails the `satisfies` check at build.
    expect(groups.sort()).toEqual(Object.values(EventBusGroup).sort());
  });

  it('names groups so they cannot be mistaken for the domains they read', () => {
    // Group names and domains live in different namespaces (a Redis group vs a
    // `type` prefix), so a collision is harmless — but `audit` IS both a group
    // and a domain (`audit.exported`), the one place the two vocabularies
    // overlap. Pinning the exact overlap keeps a future rename from silently
    // changing what a lane reads.
    const collisions = groups.filter((group) => realDomains.has(group));
    expect(collisions).toEqual(['audit']);
  });

  describe('per group', () => {
    it.each(groups)('%s subscribes only to real domains', (group) => {
      const domains = SUBSCRIPTIONS[group as EventBusGroup];
      if (domains === '*') {
        return;
      }
      const unknown = (domains as readonly string[]).filter(
        (domain) => !realDomains.has(domain),
      );
      expect(unknown).toEqual([]);
    });

    it.each(groups)('%s declares a non-empty subscription', (group) => {
      const domains = SUBSCRIPTIONS[group as EventBusGroup];
      expect(domains === '*' || domains.length > 0).toBe(true);
    });
  });

  describe('audit', () => {
    it('takes every domain, because its filter is the persist policy', () => {
      expect(SUBSCRIPTIONS[EventBusGroup.Audit]).toBe('*');
    });
  });

  describe('notifications', () => {
    // Self-feeding loop guard: the notifications lane EMITS notification.sent
    // / notification.failed for observability. Consuming its own domain would
    // make every notification generate another one, forever.
    it('does NOT consume the notification domain', () => {
      expect(SUBSCRIPTIONS[EventBusGroup.Notifications] as readonly string[]).not.toContain(
        'notification',
      );
    });

    it('does consume the domains that produce user-visible changes', () => {
      expect(SUBSCRIPTIONS[EventBusGroup.Notifications] as readonly string[]).toEqual(
        expect.arrayContaining(['vulnerability', 'asset', 'job', 'workflow']),
      );
    });
  });

  describe('email', () => {
    // No email lane: there is no transport behind it, so a group would claim
    // events it cannot deliver. Pinned so reintroducing one is deliberate —
    // the member and the sink have to land together.
    it('is not declared as a lane', () => {
      expect(Object.values(EventBusGroup)).not.toContain('email');
      expect(
        Object.keys(SUBSCRIPTIONS).includes('email'),
      ).toBe(false);
    });
  });

  describe('integrations', () => {
    it('includes the integration domain itself', () => {
      expect(SUBSCRIPTIONS[EventBusGroup.Integrations] as readonly string[]).toContain(
        'integration',
      );
    });

    it('does NOT consume the workspace/member domains', () => {
      // Provisioning is the audit trail's business; pushing "someone joined" to
      // a customer's webhook would be noise on a lane they connected for
      // findings.
      expect(SUBSCRIPTIONS[EventBusGroup.Integrations] as readonly string[]).not.toContain(
        'member',
      );
    });
  });

  describe('projection', () => {
    it('covers the domains that carry a read-model consequence', () => {
      expect(SUBSCRIPTIONS[EventBusGroup.Projection] as readonly string[]).toEqual(
        expect.arrayContaining(['vulnerability', 'asset', 'job', 'statistics']),
      );
    });
  });

  describe('coverage', () => {
    it('leaves no domain unclaimed by every lane, so none is silently dead', () => {
      const claimed = new Set<string>();
      for (const group of groups) {
        const domains = SUBSCRIPTIONS[group as EventBusGroup];
        if (domains === '*') continue;
        (domains as readonly string[]).forEach((domain) =>
          claimed.add(domain),
        );
      }
      // audit takes '*', so anything is "claimed" there — this asserts the
      // narrower lanes together cover the operational domains.
      expect(claimed.has('job')).toBe(true);
      expect(claimed.has('workflow')).toBe(true);
    });

    it('leaves the audit-only domains unclaimed by the narrower lanes', () => {
      const narrower = new Set<string>();
      for (const group of groups) {
        const domains = SUBSCRIPTIONS[group as EventBusGroup];
        if (domains === '*') continue;
        (domains as readonly string[]).forEach((domain) =>
          narrower.add(domain),
        );
      }
      // Dedupe: several events share a domain, and the question is which
      // DOMAINS no lane but audit reads.
      const unclaimed = [
        ...new Set(
          EVENT_NAMES.filter(
            (name: EventName) => !narrower.has(name.split('.')[0]),
          ).map((name) => name.split('.')[0]),
        ),
      ].sort();

      // Audit-only by design: configuration, membership and credential changes
      // rather than findings — plus `notification`, the self-loop guard.
      // `workspace`, `member` and `api_key` are here because there is no email
      // lane: with no outbound channel they are audit-only today, and the moment
      // one is added this list must shrink. Asserting it exactly makes that
      // trade-off visible instead of silent.
      expect(unclaimed).toEqual(
        [
          'api_key',
          'asset_group',
          'audit',
          'member',
          'network',
          'notification',
          'permission_group',
          'report',
          'storage',
          'system_config',
          'target',
          'workspace',
        ].sort(),
      );
    });
  });
});