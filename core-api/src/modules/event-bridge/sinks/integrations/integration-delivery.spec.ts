import { AuditOutcome, NotificationType, Severity } from '@/common/enums/enum';
import type { VulnerabilityDetectedPayload } from '../../contracts/event-payloads';
import {
  eventForIntegration,
  isPushable,
  isTicketable,
  notificationTypeFor,
} from './integration-delivery';
import type { ConsumedEvent } from '../../contracts/event-envelope';

/**
 * Run: task api:test:one SPEC=src/modules/event-bridge/sinks/integrations/integration-delivery.spec.ts
 */
describe('integration delivery policy', () => {
  const base: ConsumedEvent = {
    eventId: 'evt-1',
    workspaceId: 'ws-1',
    outcome: AuditOutcome.Success,
  };

  const detected: ConsumedEvent = {
    ...base,
    payload: {
      jobId: 'j-1',
      targetId: 't-1',
      assetId: 'a-1',
      assetValue: 'app.example.com',
      vulnerabilities: [
        { id: 'c1', name: 'c', severity: Severity.CRITICAL },
        { id: 'h1', name: 'h', severity: Severity.HIGH },
        { id: 'm1', name: 'm', severity: Severity.MEDIUM },
      ],
    } satisfies VulnerabilityDetectedPayload,
  };

  const severitiesOf = (event: ConsumedEvent | undefined) =>
    (event?.payload as VulnerabilityDetectedPayload | undefined)?.vulnerabilities.map(
      (v) => v.severity,
    );

  it('opens tickets for findings only — never for runs or ticket events', () => {
    expect(isTicketable('vulnerability.detected')).toBe(true);
    expect(isTicketable('workflow.run.completed')).toBe(false);
    // A ticket about a ticket would loop forever.
    expect(isTicketable('integration.ticket.created')).toBe(false);
  });

  it('keeps only enabled severities, using schema defaults for missing toggles', () => {
    // Defaults: critical/high on, medium off.
    expect(severitiesOf(eventForIntegration('vulnerability.detected', detected, {}))).toEqual([
      Severity.CRITICAL,
      Severity.HIGH,
    ]);
  });

  it('honours explicit severity toggles over defaults', () => {
    const scoped = eventForIntegration('vulnerability.detected', detected, {
      critical: false,
      high: false,
      medium: true,
    });
    expect(severitiesOf(scoped)).toEqual([Severity.MEDIUM]);
  });

  it('does not mutate the shared event', () => {
    eventForIntegration('vulnerability.detected', detected, {});
    expect(severitiesOf(detected)).toHaveLength(3);
  });

  it('drops the event when no enabled severity remains', () => {
    expect(
      eventForIntegration('vulnerability.detected', detected, {
        critical: false,
        high: false,
      }),
    ).toBeUndefined();
  });

  it('mutes by notification-type toggle and by raw event name', () => {
    expect(
      eventForIntegration('vulnerability.detected', detected, {
        [NotificationType.NEW_VULNERABILITY_FOUND]: false,
      }),
    ).toBeUndefined();
    expect(
      eventForIntegration('vulnerability.status.updated', base, {
        'vulnerability.status.updated': false,
      }),
    ).toBeUndefined();
    expect(eventForIntegration('vulnerability.status.updated', base, {})).toBe(base);
  });

  it('maps a run to the toggle matching how it ended', () => {
    const clean = { ...base, payload: { failedSteps: [], blockedSteps: [], cancelledSteps: [] } };
    expect(notificationTypeFor('workflow.run.completed', clean)).toBe(
      NotificationType.ASSET_NEW_DETECT,
    );
    expect(
      notificationTypeFor('workflow.run.completed', {
        ...base,
        outcome: AuditOutcome.Failure,
        payload: { failedSteps: ['nuclei'] },
      }),
    ).toBe(NotificationType.SCAN_INCOMPLETE);
    expect(notificationTypeFor('vulnerability.status.updated', base)).toBeUndefined();
  });

  it('pushes new URLs, muted by their own notification-type toggle', () => {
    expect(isPushable('asset.url.discovered')).toBe(true);
    expect(isTicketable('asset.url.discovered')).toBe(false);
    expect(notificationTypeFor('asset.url.discovered', base)).toBe(
      NotificationType.NEW_URL_FOUND,
    );
    expect(eventForIntegration('asset.url.discovered', base, {})).toBe(base);
    expect(
      eventForIntegration('asset.url.discovered', base, {
        [NotificationType.NEW_URL_FOUND]: false,
      }),
    ).toBeUndefined();
  });
});
