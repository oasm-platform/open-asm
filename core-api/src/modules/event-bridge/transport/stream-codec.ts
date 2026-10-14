import type { StreamEntry } from '@/services/redis/redis.service';
import type {
  ConsumedEvent,
  EventEnvelopeData,
} from '../contracts/event-envelope';

/**
 * The ONE place that knows how a CloudEvent is laid out in a Redis Stream
 * entry. The publisher encodes with {@link toStreamFields}, every consumer
 * decodes with {@link readEvent}; keeping both directions side by side is what
 * stops them from drifting apart.
 *
 * Layout: each CloudEvents context attribute is its own stream field and the
 * payload is JSON in `data` — the CloudEvents "event format", which lets a
 * consumer route on `type`/`id` without parsing the payload.
 */

/**
 * Flattens a structured CloudEvents envelope into Redis Stream fields.
 *
 * `data` is the only non-scalar attribute, so it is JSON-encoded into its own
 * field. Every other attribute is JSON-encoded too when it is not already a
 * string: `String(value)` on an object would silently write the literal
 * `"[object Object]"`, and JSON keeps numbers/booleans byte-identical to their
 * String() form while making anything structured lossless.
 *
 * An absent `data` stays absent rather than becoming `null` — `data` is
 * OPTIONAL, and fabricating an empty payload would tell a consumer the
 * opposite of the truth.
 */
export function toStreamFields(
  envelope: Record<string, unknown>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(envelope)) {
    if (value === undefined) {
      continue;
    }
    fields[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return fields;
}

/**
 * Builds the envelope for one stream entry, or undefined when the payload
 * cannot be attributed (no workspace, or no outcome). A sink must never invent
 * those, so an unattributable entry is dropped rather than guessed.
 */
export function readEvent(entry: StreamEntry): ConsumedEvent | undefined {
  const data = parseData(entry.fields.data);
  if (!data) return undefined;
  const rawTime = entry.fields.time;
  const parsedTime = rawTime ? new Date(rawTime) : undefined;
  return {
    ...data,
    eventId: entry.fields.id,
    occurredAt:
      parsedTime && !Number.isNaN(parsedTime.getTime())
        ? parsedTime.toISOString()
        : undefined,
  };
}

/** Decodes the `data` field; undefined when it is missing or unattributable. */
export function parseData(
  raw: string | undefined,
): EventEnvelopeData | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const data = parsed as EventEnvelopeData;
    if (!data.workspaceId || !data.outcome) return undefined;
    return data;
  } catch {
    return undefined;
  }
}
