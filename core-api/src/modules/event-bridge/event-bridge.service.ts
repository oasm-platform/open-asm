import { Injectable, Logger } from '@nestjs/common';
import { CloudEvent } from 'cloudevents';
import { RedisService } from '@/services/redis/redis.service';
import type { CatalogEvent, EventName } from './event';
import { EVENT_CATALOG_TOKEN, resolveEventName } from './event';
import { Inject } from '@nestjs/common';

/**
 * Single stream every event lands on.
 *
 * Kept as a constant rather than a per-domain stream map: the audit mirror is
 * useless if a consumer has to open 21 streams to read one workspace's
 * history, and one stream keeps XTRIM/retention a single policy. Split by
 * domain later if consumer lag on `worker.alive` ever threatens retention of
 * the audit events.
 */
export const EVENT_BRIDGE_STREAM = 'oasm:events';

/**
 * CloudEvents `source` — the context the occurrence happened in. Absolute URI
 * because the spec RECOMMENDS it. Fixed for the core-api process: `source`+`id`
 * stays unique because `id` is a fresh UUID per event, so a per-workspace
 * source is unnecessary.
 *
 * NOTE: this is unrelated to `EVENT_SCHEMA_VERSION`, which versions the
 * payload shape. CloudEvents `specversion` is always the literal "1.0".
 */
export const EVENT_BRIDGE_SOURCE = 'oasm://core-api';

/** Per-call overrides for the optional CloudEvents context attributes. */
export interface PublishOptions {
  /**
   * Identifies the subject within the source, e.g. `job:8f3c`. Lets a consumer
   * filter on the resource without decoding `data`.
   */
  subject?: string;
  /** URI of the schema `data` adheres to. */
  dataschema?: string;
  /**
   * Overrides the event type. Only for the rare caller that must publish under
   * a different name than the catalog leaf — an empty string still throws, so
   * the SDK's own validation is what rejects it.
   */
  type?: string;
}

/**
 * Writes domain events to a Redis Stream as CloudEvents.
 *
 * The CloudEvents object is built and validated by `@cloudevents/sdk-javascript`
 * (`cloudevents@10`), which supplies the four REQUIRED attributes, stamps
 * `time`, and rejects a malformed envelope. The SDK has no Redis transport, so
 * this class owns the XADD.
 *
 * Stream layout: each CloudEvents context attribute becomes its own stream
 * field, and the payload is JSON-encoded into `data`. That is the CloudEvents
 * "event format" (as opposed to "structured mode", which would hide everything
 * behind one JSON blob) and it is what Redis Streams want anyway — a consumer
 * reads `type`/`id`/`subject` to route without parsing the payload.
 */
@Injectable()
export class EventBridgeService {
  private readonly logger = new Logger(EventBridgeService.name);

  constructor(
    private readonly redis: RedisService,
    @Inject(EVENT_CATALOG_TOKEN) private readonly catalog: unknown,
  ) {}

  /**
   * Publishes one event and returns the stream entry id, or null when the name
   * is not in the catalog.
   *
   * The event is named by the catalog leaf: `publish(EVENT_CATALOG.job.completed,
   * data)`. The caller never spells a name, so a typo is a compile error and an
   * undeclared event cannot reach the stream.
   *
   * Throws if Redis rejects the write. Callers on a business-critical path
   * should use {@link publishSafely} instead.
   */
  async publish(
    event: CatalogEvent | string,
    data?: unknown,
    options: PublishOptions = {},
  ): Promise<string | null> {
    const name = resolveEventName(event);
    if (!name) {
      // Not a Redis problem, so this is a bug in the caller: the name is a
      // literal in the source, which means either the catalog is out of date
      // or a value arrived from an untyped source. Loud, but not fatal.
      this.logger.error(
        `Refusing to publish undeclared event: ${describe(event)}`,
      );
      return null;
    }

    const cloudEvent = new CloudEvent({
      type: options.type ?? name,
      source: EVENT_BRIDGE_SOURCE,
      ...(options.subject ? { subject: options.subject } : {}),
      ...(options.dataschema ? { dataschema: options.dataschema } : {}),
      ...(data === undefined ? {} : { data }),
    });

    return this.redis.xadd(
      EVENT_BRIDGE_STREAM,
      toStreamFields(cloudEvent.toJSON()),
    );
  }

  /**
   * Same as {@link publish} but never throws: a Redis outage must not fail the
   * request that happened to be emitting. Mirrors `AuditService.auditSafely`,
   * which exists for exactly the same reason on the audit path.
   *
   * Returns null when the event was dropped, so a caller that cares can log it.
   */
  async publishSafely(
    event: CatalogEvent | string,
    data?: unknown,
    options: PublishOptions = {},
  ): Promise<string | null> {
    try {
      return await this.publish(event, data, options);
    } catch (error) {
      this.logger.error(
        `Failed to publish event ${describe(event)}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }
}

/** Human-readable name for logs, without assuming the value is a leaf. */
function describe(event: CatalogEvent | string): string {
  return typeof event === 'string' ? event : (event?.name ?? '<unknown>');
}

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
function toStreamFields(
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

export type { EventName };
