import { AUDIT_ACTION_CATALOG } from '../audit/constants/audit-events';
import { EVENT_NAMES, type EventName } from '../connectors/event';
import { EVENT_POLICY, eventSeverity, isPersisted } from './event-policy';

/**
 * `EVENT_POLICY` is the source of truth for "does this event become an audit
 * row". It is the single place a new event's routing is decided, so the risks
 * are (a) a key goes missing as the catalog grows, and (b) the map drifts from
 * the audit dictionary it is meant to replace.
 *
 * The exhaustiveness check that matters is a COMPILE error — the map is typed
 * `Record<EventName, EventPolicy>`, so a new leaf without a policy fails
 * `task api:build` before this file ever runs. What this spec adds is the
 * runtime half: that the policy agrees with the audit catalog, and that the
 * lookup helpers never return a wrong default for a real event.
 *
 * Run: task api:test:one SPEC=src/modules/event-bridge/event-policy.spec.ts
 */
describe('event policy', () => {
  describe('coverage', () => {
    it('declares a policy for every catalog event', () => {
      const missing = EVENT_NAMES.filter((name) => !EVENT_POLICY[name]);
      expect(missing).toEqual([]);
    });

    it('declares no policy for an event the catalog does not have', () => {
      // A stale key would be dead config that reads as coverage in review.
      expect(Object.keys(EVENT_POLICY).sort()).toEqual([...EVENT_NAMES].sort());
    });
  });

  describe('audit parity', () => {
    // The migration contract: `persist: true` must cover exactly the 35 names
    // the old AUDIT_ACTION_CATALOG declared. This is the assertion that lets
    // `audit-events.ts` be deleted without losing an audit-worthy event.
    it('persists exactly the audit catalog actions', () => {
      const persisted = EVENT_NAMES.filter((name) => isPersisted(name));
      const auditActions = AUDIT_ACTION_CATALOG.map((a) => a.action).sort();
      expect(persisted.sort()).toEqual(auditActions);
    });

    it.each(AUDIT_ACTION_CATALOG.map((entry) => entry.action))(
      '%s is persisted',
      (action) => {
        expect(isPersisted(action as EventName)).toBe(true);
      },
    );
  });

  describe('worker.alive', () => {
    // Removed in P4: liveness is a heartbeat, read from `workers.lastSeenAt` +
    // `AliveStreamManager`, not a state transition. On the shared stream a
    // per-worker-per-minute event is the entry MAXLEN evicts first, so it would
    // push the audit trail out of the log.
    it('is not part of the catalog at all', () => {
      expect(EVENT_NAMES).not.toContain('worker.alive' as EventName);
      expect(EVENT_POLICY).not.toHaveProperty('worker.alive');
    });

    it('leaves the rest of the worker lifecycle intact', () => {
      expect(EVENT_NAMES).toContain('worker.joined');
      expect(EVENT_NAMES).toContain('worker.disconnected');
    });
  });

  describe('notification domain', () => {
    // The `notifications` group must not consume its own output; these two
    // leaves are read by the `audit` group for metrics only.
    it.each([
      ['notification.sent', false],
      ['notification.failed', false],
    ] as const)('%s is not persisted', (name, expected) => {
      expect(isPersisted(name)).toBe(expected);
    });
  });

  describe('severity', () => {
    it('marks a workspace deletion critical', () => {
      expect(eventSeverity('workspace.deleted')).toBe('critical');
    });

    it.each(EVENT_NAMES)('%s resolves a declared severity', (name) => {
      expect(['normal', 'important', 'critical']).toContain(
        EVENT_POLICY[name].severity,
      );
    });
  });

  describe('lookup helpers', () => {
    it('returns false for an unknown name instead of throwing', () => {
      expect(isPersisted('nope.nope' as EventName)).toBe(false);
    });

    it('falls back to normal severity for an unknown name', () => {
      expect(eventSeverity('nope.nope' as EventName)).toBe('normal');
    });
  });
});