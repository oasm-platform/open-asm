import type { RedisService } from '@/services/redis/redis.service';

/**
 * How long a processed-event marker lives. Must exceed the retry horizon
 * (`EVENT_BUS_MAX_ATTEMPTS` × worst-case backoff) or a duplicate that arrives
 * late would be processed twice.
 */
const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Marks an event as handled so a redelivery is a no-op.
 *
 * This is the idempotency mechanism for sinks that write rows the schema does
 * not key by event id (notifications, outbound webhooks): `SET NX` is atomic,
 * and the TTL bounds how long a duplicate can be suppressed — long enough to
 * cover any realistic retry or crash window, short enough that the memory is
 * reclaimed. Sinks that CAN dedupe in the database (audit, via `eventId`)
 * should prefer that, since it survives a Redis flush.
 *
 * `key` is usually the event id; a sink that produces several independent
 * effects from one event suffixes it (`<eventId>:<effect>`).
 */
export async function claimEventOnce(
  redis: RedisService,
  group: string,
  key: string,
): Promise<boolean> {
  const marker = `event-bus:handled:${group}:${key}`;
  const set = await redis.setIfAbsent(marker, '1');
  if (!set) return false;
  await redis.setex(marker, DEDUP_TTL_SECONDS, '1');
  return true;
}
