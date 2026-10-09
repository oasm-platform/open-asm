import { SetMetadata } from '@nestjs/common';
import type { AuditActorType } from '@/common/enums/enum';
import type { CatalogEvent } from '../connectors/event';

export const PUBLISH_EVENT_KEY = 'publish_event_key';

/**
 * Extractors for `@PublishEvent`.
 *
 * The shape is deliberately identical to the old `AuditLogConfig`: migrating a
 * call site is a rename of the decorator, not a rewrite of its config. Only the
 * CONSUMER at the end of the chain changed (audit row → stream entry).
 */
export interface PublishEventConfig {
  /** Fallback resourceType: `type.split('.')[0]` when omitted. */
  resourceType?: string;
  /** Extracts the resourceId from the handler's success result. */
  resourceId?: (result: unknown) => string | undefined;
  /**
   * Extracts the workspaceId from the handler's success result. Used by actions
   * where the workspace is created BY the call (`workspace.created`) — there is
   * no request workspaceId yet, and the engine skips the publish when neither
   * the ALS value nor this resolver yields one.
   */
  workspaceId?: (result: unknown) => string | undefined;
  /** Computes the before/after diff from the request body (+ result). */
  changes?: (
    body: unknown,
    result: unknown,
  ) => Record<string, { before?: unknown; after?: unknown }>;
  /**
   * Scalar context (counts, ids, enums). Never pass emails, tokens or keys —
   * values matching a secret pattern are redacted at publish time.
   */
  metadata?: (
    body: unknown,
    result: unknown,
  ) => Record<string, string | number | boolean | string[]>;
  /**
   * Actor for non-HTTP producers (BullMQ processor, scheduler, worker gRPC),
   * which have no request and therefore no ALS session. HTTP handlers get the
   * actor from the request automatically and do not set this.
   */
  actor?: (args: unknown, result: unknown) => { type: AuditActorType; id?: string };
  /**
   * Replaces the domain payload. Used by producers whose result is large or
   * shaped differently than the event wants to carry.
   */
  payload?: (args: unknown, result: unknown) => unknown;
  /** Overrides the auto-built `workspace:{wid}/{type}:{resourceId}` subject. */
  subject?: (result: unknown) => string | undefined;
}

/**
 * Marks a handler (or service method) as emitting one domain event. The engine
 * behind the decorator resolves workspaceId + actor, redacts secrets, stamps
 * the envelope, and writes a single stream entry — the producer never learns who
 * consumes it.
 *
 * @example
 * @PublishEvent(EVENT_CATALOG.target.created, {
 *   resourceId: (result) => (result as Target).id,
 *   changes: (body) => ({ value: { after: (body as CreateTargetDto).value } }),
 * })
 */
export function PublishEvent(
  event: CatalogEvent,
  config: PublishEventConfig = {},
): MethodDecorator {
  return SetMetadata(PUBLISH_EVENT_KEY, { event, ...config });
}