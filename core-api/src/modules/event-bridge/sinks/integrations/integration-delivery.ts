import { AuditOutcome, NotificationType, type Severity } from '@/common/enums/enum';
import { severityProperties } from '@/modules/integrations/schemas/severity.schema';
import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { hasUnfinishedSteps, readPayload } from '../../contracts/event-payloads';
import { eventSeverity } from '../../routing/event-policy';

/**
 * Delivery policy for the `integrations` lane, in two steps:
 *  1. lane level — does this event go out to integrations at all?
 *  2. per integration — does THIS integration's config want it, and which part
 *     of the payload?
 * No wording lives here — that is `messages/`.
 */

/**
 * Events that justify waking an external system.
 *
 * Deliberately a short list. A webhook is a side effect on someone else's
 * infrastructure — pushing every runtime event would turn a noisy domain into
 * someone else's outage, and an integration is opt-in per workspace, so the
 * cost lands on the customer who connected it. These are the ones an operator
 * connects a webhook FOR.
 */
const PUSHABLE_EVENTS = new Set<EventName>([
  'vulnerability.detected',
  'vulnerability.dismissed',
  'vulnerability.status.updated',
  'workflow.run.completed',
  'workflow.run.failed',
  'integration.sync.failed',
  'integration.ticket.created',
]);

/**
 * Events whose `failure` outcome is a RESULT worth reporting rather than a
 * failed action: `workflow.run.completed` with `failure` means "the scan ran
 * but did not finish its graph", which is exactly what an operator wants told.
 */
const FAILURE_IS_A_RESULT = new Set<EventName>(['workflow.run.completed']);

/** Lane filter on the name alone — checked before the envelope is decoded. */
export function isPushable(name: EventName): boolean {
  return PUSHABLE_EVENTS.has(name);
}

/**
 * Lane filter on the decoded envelope. A failed non-critical action is an
 * implementation detail; pushing it would train integrators to ignore the
 * stream.
 */
export function shouldPush(name: EventName, event: ConsumedEvent): boolean {
  return (
    event.outcome !== AuditOutcome.Failure ||
    eventSeverity(name) === 'critical' ||
    FAILURE_IS_A_RESULT.has(name)
  );
}

/**
 * Returns the event as this integration should see it, or undefined when the
 * integration's config mutes it.
 */
export function eventForIntegration(
  name: EventName,
  event: ConsumedEvent,
  config: Record<string, unknown>,
): ConsumedEvent | undefined {
  // An explicit `false` always wins. The form stores toggles under the
  // notification type (e.g. `NEW_VULNERABILITY_FOUND`); the raw event name is
  // still honoured for configs written by hand.
  const toggle = notificationTypeFor(name, event);
  if (
    config[name] === false ||
    (toggle !== undefined && config[toggle] === false)
  ) {
    return undefined;
  }

  if (name === 'vulnerability.detected') {
    return filterBySeverity(event, config);
  }
  return event;
}

/**
 * The integration-config toggle that governs an event, mirroring the
 * notification types the in-app lane emits for the same event. Undefined means
 * the event has no toggle of its own and is always delivered.
 */
export function notificationTypeFor(
  name: EventName,
  event: ConsumedEvent,
): NotificationType | undefined {
  switch (name) {
    case 'vulnerability.detected':
      return NotificationType.NEW_VULNERABILITY_FOUND;
    case 'workflow.run.completed':
      return event.outcome === AuditOutcome.Failure ||
        hasUnfinishedSteps(readPayload(name, event))
        ? NotificationType.SCAN_INCOMPLETE
        : NotificationType.ASSET_NEW_DETECT;
    default:
      return undefined;
  }
}

/**
 * Narrows `vulnerability.detected` to the severities this integration
 * subscribed to; undefined when nothing is left to say.
 *
 * A missing toggle falls back to the schema default, so an integration saved
 * before a toggle existed behaves the way the form shows it.
 */
function filterBySeverity(
  event: ConsumedEvent,
  config: Record<string, unknown>,
): ConsumedEvent | undefined {
  const payload = readPayload('vulnerability.detected', event);
  const enabled = (severity: Severity) =>
    typeof config[severity] === 'boolean'
      ? config[severity]
      : (severityProperties[severity]?.default ?? false);

  const vulnerabilities = (payload.vulnerabilities ?? []).filter((v) =>
    enabled(v.severity),
  );
  if (vulnerabilities.length === 0) {
    return undefined;
  }
  return { ...event, payload: { ...payload, vulnerabilities } };
}
