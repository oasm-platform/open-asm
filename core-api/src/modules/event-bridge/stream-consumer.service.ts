import {
  EVENT_BUS_CLAIM_MIN_IDLE_MS,
  EVENT_BUS_MAX_ATTEMPTS,
  EVENT_BUS_READ_BLOCK_MS,
  EVENT_BUS_READ_COUNT,
  EVENT_BUS_STREAM,
  eventBusDlqKey,
} from '@/common/constants/app.constants';
import { Injectable, Logger } from '@nestjs/common';
import { hostname } from 'os';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';
import type { StreamEntry } from '@/services/redis/redis.service';
import type { EventName } from '../connectors/event';
import { resolveEventName } from '../connectors/event';
import type { EventEnvelopeData } from './event-envelope';

/**
 * Per-group configuration. One consumer group per lane: the transport (group
 * name, domain filter, retry/DLQ) is identical for every sink, so it lives
 * here and each sink only supplies a handler.
 */
export interface StreamConsumerOptions {
  /** Consumer group name — the lane this sink owns. */
  readonly group: string;
  /**
   * Domains this group consumes, or `'*'` for all. The domain is the FIRST
   * segment of the event name (`job.completed` → `job`), which is why one
   * stream can serve 21 domains without opening 21 streams.
   *
   * Filtering on the name (not on `data`) is what keeps a consumer from having
   * to decode payloads it does not care about.
   */
  readonly domains: '*' | readonly string[];
  /**
   * Hold a Redis lock so only ONE instance runs this loop. Required for the
   * `audit` group (strictly-ordered materialized view); leave off for groups
   * whose handlers are order-independent, which then run on every replica.
   */
  readonly singleInstance?: boolean;
  /** Lock key + TTL, only read when `singleInstance` is set. */
  readonly lock?: { key: string; ttlMs: number };
}

/**
 * Redis Streams consumer loop shared by every event-bus sink.
 *
 * Why one stream and N groups: a consumer group tracks its OWN read position,
 * so each lane sees every entry and advances independently. One stream also
 * means FIFO order holds ACROSS domains within a group — splitting into 21
 * streams would give that up for nothing.
 *
 * Delivery is at-least-once by construction: a handler that throws leaves the
 * entry in the group's PEL, `XAUTOCLAIM` re-delivers it once it has been idle
 * `EVENT_BUS_CLAIM_MIN_IDLE_MS`, and after `EVENT_BUS_MAX_ATTEMPTS` deliveries
 * the envelope is parked in a per-workspace DLQ and acknowledged. Retrying is
 * done BEFORE reading new entries so a stream that keeps producing cannot
 * starve an entry whose handler is still failing.
 *
 * Subclasses implement {@link onEntry}; everything else — routing, retry,
 * dead-lettering, locking — is handled here so the four sinks cannot drift in
 * their retry behaviour.
 */
@Injectable()
export abstract class StreamConsumerService {
  protected readonly logger: Logger;
  protected readonly consumer = `${hostname()}:${process.pid}`;

  private running = false;
  private stopped = false;
  private loop: Promise<void> | null = null;

  constructor(
    protected readonly redis: RedisService,
    protected readonly lock: RedisLockService,
    protected readonly options: StreamConsumerOptions,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  /** Creates the group and starts the loop. Idempotent across reboots. */
  async onModuleInit(): Promise<void> {
    // Start at `0`: a fresh consumer must see the WHOLE stream, not only what
    // arrives after it booted. Anything already acked is gone, which is why
    // replay is "drop the rows, reset the group, re-read".
    try {
      await this.redis.xgroupCreate(EVENT_BUS_STREAM, this.options.group, '0');
    } catch (error) {
      this.logger.error(
        `Failed to create the '${this.options.group}' consumer group: ${describe(error)}`,
      );
    }
    this.start();
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  start(): void {
    if (this.running || this.stopped) return;
    this.running = true;
    this.loop = this.run();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
  }

  /** One lock-protected drain cycle. Public so tests can drive it directly. */
  async runOnce(): Promise<void> {
    const drain = () => this.cycle();
    try {
      if (this.options.singleInstance && this.options.lock) {
        await this.lock.withLock(
          this.options.lock.key,
          this.options.lock.ttlMs,
          drain,
        );
        return;
      }
      await drain();
    } catch (error) {
      if (await this.recoverMissingGroup(error)) {
        return;
      }
      throw error;
    }
  }

  /**
   * Re-creates the consumer group when Redis reports it is gone.
   *
   * A consumer group is stored ON the stream key, so anything that removes the
   * key removes the groups with it — an eviction under `allkeys-lru`, a
   * `FLUSHDB`, or an operator's cleanup script. Without this, every lane fails
   * with `NOGROUP` forever: `onModuleInit` only runs at boot, so nothing would
   * ever bring them back, and the audit trail would simply stop being written
   * while the API looked healthy.
   *
   * Recreated from `0` because that is the safe direction: if the stream was
   * lost there is nothing to replay, and if it merely lost its group the
   * surviving entries should still be materialized.
   *
   * Returns true when the failure was a missing group and it has been restored,
   * so the caller can skip the cycle instead of throwing and backing off.
   */
  protected async recoverMissingGroup(error: unknown): Promise<boolean> {
    const message = describe(error);
    if (!message.includes('NOGROUP') && !message.includes('no such key')) {
      return false;
    }

    this.logger.warn(
      `Consumer group '${this.options.group}' is missing (stream key may have been evicted); recreating it`,
    );
    try {
      await this.redis.xgroupCreate(EVENT_BUS_STREAM, this.options.group, '0');
      return true;
    } catch (createError) {
      // Another replica won the race and already recreated it.
      if (describe(createError).includes('BUSYGROUP')) {
        return true;
      }
      this.logger.error(
        `Failed to recreate the '${this.options.group}' consumer group: ${describe(createError)}`,
      );
      return false;
    }
  }

  private async run(): Promise<void> {
    while (this.running && !this.stopped) {
      try {
        if (this.options.singleInstance && this.options.lock) {
          const ran = await this.lock.withLock(
            this.options.lock.key,
            this.options.lock.ttlMs,
            () => this.cycle(),
          );
          if (ran === null) {
            // Another replica owns this cycle — back off instead of spinning.
            await delay(EVENT_BUS_READ_BLOCK_MS);
          }
        } else {
          await this.cycle();
        }
      } catch (error) {
        // A missing group is recoverable and self-inflicted by Redis state we
        // do not control (eviction, flush); restoring it here is what stops the
        // lane from being dead for the rest of the process's life.
        if (await this.recoverMissingGroup(error)) {
          continue;
        }
        this.logger.error(`Consumer cycle failed: ${describe(error)}`);
        await delay(EVENT_BUS_READ_BLOCK_MS);
      }
    }
  }

  protected async cycle(): Promise<void> {
    await this.retryStalled();
    await this.drainNew();
  }

  private async drainNew(): Promise<void> {
    const entries = await this.redis.xreadgroup(
      EVENT_BUS_STREAM,
      this.options.group,
      this.consumer,
      EVENT_BUS_READ_COUNT,
      EVENT_BUS_READ_BLOCK_MS,
    );
    for (const entry of entries) {
      await this.dispatch(entry);
    }
  }

  private async retryStalled(): Promise<void> {
    const entries = await this.redis.xautoclaim(
      EVENT_BUS_STREAM,
      this.options.group,
      this.consumer,
      EVENT_BUS_CLAIM_MIN_IDLE_MS,
      EVENT_BUS_READ_COUNT,
    );
    for (const entry of entries) {
      await this.dispatch(entry);
    }
  }

  private async dispatch(entry: StreamEntry): Promise<void> {
    try {
      const name = resolveEventName(entry.fields.type);
      if (!name) {
        // Not a routing failure: an entry whose type the catalog dropped must
        // still be acked, or it would be reclaimed on every cycle forever.
        this.logger.warn(
          `Acknowledging unknown event type '${entry.fields.type}' (entry ${entry.id})`,
        );
        await this.ack(entry);
        return;
      }

      if (!this.consumes(name)) {
        await this.ack(entry);
        return;
      }

      const event = readEvent(entry);
      if (!event) {
        // Permanent condition, not a transient failure: acking keeps the entry
        // from being reclaimed on every cycle.
        this.logger.warn(
          `Acknowledging unattributable envelope for '${name}' (entry ${entry.id})`,
        );
        await this.ack(entry);
        return;
      }

      await this.onEntry(name, event);
      await this.ack(entry);
    } catch (error) {
      await this.onFailure(entry, error);
    }
  }

  /** Domain filter for this group. Deeper rules belong in the handler. */
  protected consumes(name: EventName): boolean {
    if (this.options.domains === '*') return true;
    return this.options.domains.includes(name.split('.')[0]);
  }

  /**
   * Handles one entry. MUST acknowledge-worthy work only: throwing here is
   * what triggers the retry/DLQ path, so a permanently-failing event must be
   * handled without throwing (return normally) instead.
   */
  protected abstract onEntry(
    name: EventName,
    event: ConsumedEvent,
  ): Promise<void>;

  /**
   * Called when {@link onEntry} throws. The default parks the envelope in the
   * DLQ once attempts are exhausted; a sink that can recover differently can
   * override.
   */
  protected async onFailure(entry: StreamEntry, error: unknown): Promise<void> {
    const attempts = await this.redis.xpendingCount(
      EVENT_BUS_STREAM,
      this.options.group,
      entry.id,
    );

    if (attempts < EVENT_BUS_MAX_ATTEMPTS) {
      this.logger.error(
        `Handler failed for entry ${entry.id} in '${this.options.group}' (attempt ${attempts}/${EVENT_BUS_MAX_ATTEMPTS}): ${describe(error)}`,
      );
      return;
    }

    const workspaceId = parseData(entry.fields.data)?.workspaceId;
    if (workspaceId) {
      await this.redis.xadd(eventBusDlqKey(workspaceId), {
        ...entry.fields,
        group: this.options.group,
        failedAt: new Date().toISOString(),
        error: describe(error),
      });
    }

    this.logger.error(
      `Gave up on entry ${entry.id} in '${this.options.group}' after ${attempts} attempts${
        workspaceId ? `; parked in ${eventBusDlqKey(workspaceId)}` : ''
      }: ${describe(error)}`,
    );
    await this.ack(entry);
  }

  protected async ack(entry: StreamEntry): Promise<void> {
    await this.redis.xack(EVENT_BUS_STREAM, this.options.group, entry.id);
  }
}

/**
 * Marks an event as handled so a redelivery is a no-op.
 *
 * This is the idempotency mechanism for sinks that write rows the schema does
 * not key by event id (notifications, outbound webhooks): `SET NX` is atomic,
 * and the TTL bounds how long a duplicate can be suppressed — long enough to
 * cover any realistic retry or crash window, short enough that the memory is
 * reclaimed. Sinks that CAN dedupe in the database (audit, via `eventId`)
 * should prefer that, since it survives a Redis flush.
 */
export async function claimEventOnce(
  redis: RedisService,
  group: string,
  eventId: string,
): Promise<boolean> {
  const key = `event-bus:handled:${group}:${eventId}`;
  const set = await redis.setIfAbsent(key, '1');
  if (!set) return false;
  await redis.setex(key, DEDUP_TTL_SECONDS, '1');
  return true;
}

/**
 * How long a processed-event marker lives. Must exceed the retry horizon
 * (`EVENT_BUS_MAX_ATTEMPTS` × worst-case backoff) or a duplicate that arrives
 * late would be processed twice.
 */
const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Normalized envelope handed to a sink: the producer's `data` plus the two
 * CloudEvents attributes every sink needs and none should re-derive from the
 * raw entry — the idempotency key (`id`) and the ordering key (`time`).
 */
export interface ConsumedEvent extends EventEnvelopeData {
  /** CloudEvents `id`. Also the idempotency key for redeliveries. */
  eventId: string;
  /** CloudEvents `time` as an ISO string, or undefined when malformed. */
  occurredAt?: string;
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

export const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));