/**
 * Events the browser may receive over `GET /events/stream`.
 *
 * ALLOWLIST, not a denylist: the bridge stream also carries API key rotations,
 * permission changes and audit exports, and a new catalog leaf must not reach
 * every open tab just because someone declared it. To expose more, add an
 * exact name (`job.completed`) or a whole domain (`job.*`) here.
 *
 * `notification.*` covers `notification.created`, the per-user push emitted
 * when an in-app notification row is written (it is not a bridge event).
 */
export const CLIENT_EVENTS = [
  'notification.*',
  'worker.*',
  'target.*',
  'workflow.*',
] as const;

/** Name of the push emitted for a newly delivered in-app notification. */
export const NOTIFICATION_CREATED = 'notification.created';

/**
 * What a client receives: a pointer to what changed, never the payload.
 *
 * The envelope carries actor email, source IP, before/after diffs and
 * free-form payloads that the REST endpoints filter by permission. Sending
 * only ids makes the client refetch through those endpoints, so the stream
 * can never show more than the reader is allowed to see.
 */
export interface ClientEvent {
  /** CloudEvents id (or notification id); unique per event. */
  id: string;
  /** Event name, e.g. `worker.joined`. */
  type: string;
  /** ISO timestamp of when it happened, when known. */
  time?: string;
  resourceType?: string;
  resourceId?: string;
  /**
   * Public id of the one-time join key a new worker used (`worker.joined`
   * only). An opaque alias — never the key itself — so the console dialog
   * that issued the key can recognize its own worker.
   */
  joinKeyId?: string;
}

/** True when `name` matches an entry of {@link CLIENT_EVENTS}. */
export function isClientEvent(
  name: string,
  allowlist: readonly string[] = CLIENT_EVENTS,
): boolean {
  return allowlist.some((pattern) =>
    pattern.endsWith('.*')
      ? name.startsWith(pattern.slice(0, -1))
      : name === pattern,
  );
}
