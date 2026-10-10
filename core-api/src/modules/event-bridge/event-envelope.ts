import type { AuditActorType, AuditOutcome } from '@/common/enums/enum';

/**
 * The event envelope's `data` payload.
 *
 * CloudEvents already carries the transport context (type/source/id/time/
 * subject), so `data` only holds what the AUDIT SINK needs to build a row. That
 * is deliberate: the sink must never re-derive provenance, it only materializes
 * what the producer stamped.
 *
 * `workspaceId` is REQUIRED (plan §0) — the stream carries no global/sentinel
 * events, which is what lets a consumer filter by workspace without decoding
 * `data` and keeps `audit_events.workspace_id` NOT NULL.
 */
export interface EventEnvelopeData {
  /** Workspace the event belongs to. Mandatory. */
  workspaceId: string;
  /** Who caused it. Absent for system/worker producers. */
  actor?: {
    id?: string;
    type: AuditActorType;
    name?: string;
    email?: string;
  };
  /** Success or failure. Absent ⇒ the audit sink skips the event. */
  outcome?: AuditOutcome;
  resourceType?: string;
  resourceId?: string;
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  metadata?: Record<string, string | number | boolean | string[]>;
  sourceIp?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  /** Free-form domain payload, already redacted by the producer. */
  payload?: unknown;
}

/** Guards for the two fields the sink cannot do without. */
export function isPersistableEnvelope(
  data: EventEnvelopeData | undefined,
): data is EventEnvelopeData & { workspaceId: string; outcome: AuditOutcome } {
  return (
    typeof data?.workspaceId === 'string' &&
    data.workspaceId.length > 0 &&
    typeof data.outcome === 'string'
  );
}