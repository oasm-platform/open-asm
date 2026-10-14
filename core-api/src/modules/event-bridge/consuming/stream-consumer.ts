import {
  EVENT_BUS_CLAIM_MIN_IDLE_MS,
  EVENT_BUS_MAX_ATTEMPTS,
  EVENT_BUS_READ_BLOCK_MS,
  EVENT_BUS_READ_COUNT,
  EVENT_BUS_STREAM,
  eventBusDlqKey,
} from '@/common/constants/app.constants';
import type { RedisLockService } from '@/services/redis/distributed-lock.service';
import type { RedisService, StreamEntry } from '@/services/redis/redis.service';
import { Logger } from '@nestjs/common';
import { hostname } from 'os';
import { resolveEventName, type EventName } from '../contracts/event-catalog';
import { parseData, readEvent } from '../transport/stream-codec';
import type { EventSink } from './event-sink';

/**
 * Redis Streams consumer loop for ONE consumer group, driving one
 * {@link EventSink}.
 *
 * Why one stream and N groups: a consumer group tracks its OWN read position,
 * so each lane sees every entry and advances independently. One stream also
 * means FIFO order holds ACROSS domains within a group — splitting into 21
 * streams would give that up for nothing.
 *
 * Delivery is at-least-once by construction: a sink that throws leaves the
 * entry in the group's PEL, `XAUTOCLAIM` re-delivers it once it has been idle
 * `EVENT_BUS_CLAIM_MIN_IDLE_MS`, and after `EVENT_BUS_MAX_ATTEMPTS` deliveries
 * the envelope is parked in a per-workspace DLQ and acknowledged. Retrying is
 * done BEFORE reading new entries so a stream that keeps producing cannot
 * starve an entry whose handler is still failing.
 *
 * Routing is cheapest-first: the event name (catalog, domain, `accepts`) is
 * checked before `data` is decoded, so a lane never parses JSON for an event it
 * is going to acknowledge and drop.
 */
export class StreamConsumer {
  private readonly logger: Logger;
  private readonly consumer = `${hostname()}:${process.pid}`;
  /** Domain filter, precomputed: `null` means every domain. */
  private readonly domains: ReadonlySet<string> | null;

  private running = false;
  private stopped = false;

  constructor(
    private readonly redis: RedisService,
    private readonly lock: RedisLockService,
    readonly sink: EventSink,
  ) {
    this.logger = new Logger(`StreamConsumer:${sink.group}`);
    this.domains = sink.domains === '*' ? null : new Set(sink.domains);
  }

  get group(): string {
    return this.sink.group;
  }

  /** Creates the group and starts the loop. Idempotent across reboots. */
  async init(): Promise<void> {
    // Start at `0`: a fresh consumer must see the WHOLE stream, not only what
    // arrives after it booted. Anything already acked is gone, which is why
    // replay is "drop the rows, reset the group, re-read".
    try {
      await this.redis.xgroupCreate(EVENT_BUS_STREAM, this.group, '0');
    } catch (error) {
      this.logger.error(
        `Failed to create the '${this.group}' consumer group: ${describe(error)}`,
      );
    }
    this.start();
  }

  start(): void {
    if (this.running || this.stopped) return;
    this.running = true;
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
  }

  /** One lock-protected drain cycle. Public so tests can drive it directly. */
  async runOnce(): Promise<void> {
    try {
      await this.cycleWithLock();
    } catch (error) {
      if (await this.recoverMissingGroup(error)) {
        return;
      }
      throw error;
    }
  }

  private async run(): Promise<void> {
    while (this.running && !this.stopped) {
      try {
        const ran = await this.cycleWithLock();
        if (!ran) {
          // Another replica owns this lane — back off instead of spinning.
          await delay(EVENT_BUS_READ_BLOCK_MS);
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

  /** Runs one cycle, under the lane lock when the sink is exclusive. */
  private async cycleWithLock(): Promise<boolean> {
    const { exclusive } = this.sink;
    if (!exclusive) {
      await this.cycle();
      return true;
    }
    const ran = await this.lock.withLock(
      exclusive.lockKey,
      exclusive.lockTtlMs,
      () => this.cycle(),
    );
    return ran !== null;
  }

  private async cycle(): Promise<void> {
    await this.retryStalled();
    await this.drainNew();
  }

  private async drainNew(): Promise<void> {
    const entries = await this.redis.xreadgroup(
      EVENT_BUS_STREAM,
      this.group,
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
      this.group,
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

      if (!this.wants(name)) {
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

      await this.sink.handle(name, event);
      await this.ack(entry);
    } catch (error) {
      await this.onFailure(entry, error);
    }
  }

  /** Domain filter, then the sink's own name filter. */
  private wants(name: EventName): boolean {
    if (this.domains && !this.domains.has(name.split('.')[0])) {
      return false;
    }
    return this.sink.accepts?.(name) ?? true;
  }

  /**
   * Called when the sink throws: logs while attempts remain, then parks the
   * envelope in the workspace DLQ and acknowledges it.
   */
  private async onFailure(entry: StreamEntry, error: unknown): Promise<void> {
    const attempts = await this.redis.xpendingCount(
      EVENT_BUS_STREAM,
      this.group,
      entry.id,
    );

    if (attempts < EVENT_BUS_MAX_ATTEMPTS) {
      this.logger.error(
        `Handler failed for entry ${entry.id} in '${this.group}' (attempt ${attempts}/${EVENT_BUS_MAX_ATTEMPTS}): ${describe(error)}`,
      );
      return;
    }

    const workspaceId = parseData(entry.fields.data)?.workspaceId;
    if (workspaceId) {
      await this.redis.xadd(eventBusDlqKey(workspaceId), {
        ...entry.fields,
        group: this.group,
        failedAt: new Date().toISOString(),
        error: describe(error),
      });
    }

    this.logger.error(
      `Gave up on entry ${entry.id} in '${this.group}' after ${attempts} attempts${
        workspaceId ? `; parked in ${eventBusDlqKey(workspaceId)}` : ''
      }: ${describe(error)}`,
    );
    await this.ack(entry);
  }

  /**
   * Re-creates the consumer group when Redis reports it is gone.
   *
   * A consumer group is stored ON the stream key, so anything that removes the
   * key removes the groups with it — an eviction under `allkeys-lru`, a
   * `FLUSHDB`, or an operator's cleanup script. Without this, every lane fails
   * with `NOGROUP` forever: `init` only runs at boot, so nothing would ever
   * bring them back, and the audit trail would simply stop being written while
   * the API looked healthy.
   *
   * Recreated from `0` because that is the safe direction: if the stream was
   * lost there is nothing to replay, and if it merely lost its group the
   * surviving entries should still be materialized.
   *
   * Returns true when the failure was a missing group and it has been restored,
   * so the caller can skip the cycle instead of throwing and backing off.
   */
  private async recoverMissingGroup(error: unknown): Promise<boolean> {
    const message = describe(error);
    if (!message.includes('NOGROUP') && !message.includes('no such key')) {
      return false;
    }

    this.logger.warn(
      `Consumer group '${this.group}' is missing (stream key may have been evicted); recreating it`,
    );
    try {
      await this.redis.xgroupCreate(EVENT_BUS_STREAM, this.group, '0');
      return true;
    } catch (createError) {
      // Another replica won the race and already recreated it.
      if (describe(createError).includes('BUSYGROUP')) {
        return true;
      }
      this.logger.error(
        `Failed to recreate the '${this.group}' consumer group: ${describe(createError)}`,
      );
      return false;
    }
  }

  private async ack(entry: StreamEntry): Promise<void> {
    await this.redis.xack(EVENT_BUS_STREAM, this.group, entry.id);
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
