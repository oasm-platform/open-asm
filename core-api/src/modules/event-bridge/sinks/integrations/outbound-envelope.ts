import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';

/**
 * The structured body sent to an integration alongside the rendered `text`.
 *
 * A stable, documented shape rather than the internal envelope: the envelope
 * carries `requestId`/`sourceIp`/audit fields that mean nothing outside the app
 * and would leak request correlation into customer infrastructure.
 */
export function toOutboundEnvelope(name: EventName, event: ConsumedEvent) {
  return {
    type: name,
    workspaceId: event.workspaceId,
    occurredAt: event.occurredAt,
    outcome: event.outcome,
    actor: event.actor?.name,
    resourceType: event.resourceType ?? name.split('.')[0],
    resourceId: event.resourceId,
    changes: event.changes,
    metadata: event.metadata,
    payload: event.payload,
  };
}
