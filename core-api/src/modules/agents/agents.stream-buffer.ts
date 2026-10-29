import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/services/redis/redis.service';

/**
 * Replayable buffer of one conversation's live answer stream, kept in Redis so
 * a client that reloaded or came back mid-run can reconnect and see the rest in
 * real time instead of polling the database.
 *
 * A run appends every SSE chunk here as it writes it to the live response
 * ({@link append}) and marks the end with a done sentinel ({@link finish}). A
 * reconnecting request opens {@link createResumeStream}: it replays the buffered
 * chunks from the start, then tails new ones over Redis pub/sub until the done
 * sentinel. The database remains the source of truth — this only carries the
 * last, still-streaming answer, so its keys live minutes, not hours.
 *
 * Each chunk is stored as the exact JSON string the live endpoint writes after
 * `data: `, so replay reproduces the send stream byte for byte and the AI SDK's
 * reconnect parser handles it with no special casing.
 *
 * A replay must start at the run's first chunk: the client rejects a delta
 * whose part never started. A long run outgrows {@link MAX_ENTRIES} and loses
 * its oldest chunks, so {@link reset} opens the buffer with a begin marker and
 * a backlog without it is not replayed; the client then shows the progress
 * the run saves to the database.
 */
@Injectable()
export class AgentsStreamBufferService {
  private readonly logger = new Logger(AgentsStreamBufferService.name);

  /** Entries kept per stream; ~ trims lazily, so a long answer stays bounded. */
  private static readonly MAX_ENTRIES = 5_000;
  /** Key TTL while the run produces chunks; refreshed on every append. */
  private static readonly ACTIVE_TTL_SECONDS = 600;
  /** Shorter TTL once done: a finished run is never replayed, so it only
   *  waits to be cleaned up. */
  private static readonly DONE_TTL_SECONDS = 120;
  /** Safety net: drop a resume whose run vanished without a done marker. */
  private static readonly IDLE_CHECK_MS = 10_000;

  constructor(private readonly redis: RedisService) {}

  private key(conversationId: string): string {
    return `agent:stream:${conversationId}`;
  }

  private channel(conversationId: string): string {
    return `agent:stream:chan:${conversationId}`;
  }

  /**
   * Clears any buffer left by a previous run of this conversation, so a new
   * run never replays stale chunks or a done marker in the middle of its own
   * stream, and opens the new one with the begin marker. Best-effort: a
   * failure here only costs resumability.
   */
  async reset(conversationId: string): Promise<void> {
    try {
      await this.redis.del(this.key(conversationId));
      await this.redis.xadd(
        this.key(conversationId),
        { begin: '1' },
        {
          maxLen: AgentsStreamBufferService.MAX_ENTRIES,
          ttlSeconds: AgentsStreamBufferService.ACTIVE_TTL_SECONDS,
        },
      );
    } catch (error) {
      this.logger.warn(`Failed to reset stream buffer: ${String(error)}`);
    }
  }

  /**
   * Records one chunk (the JSON string written after `data: `) and pushes it to
   * live resumers. Best-effort: a Redis hiccup must never break the live run,
   * so it only makes that chunk unresumable.
   */
  async append(conversationId: string, chunkJson: string): Promise<void> {
    try {
      const id = await this.redis.xadd(
        this.key(conversationId),
        { chunk: chunkJson },
        {
          maxLen: AgentsStreamBufferService.MAX_ENTRIES,
          ttlSeconds: AgentsStreamBufferService.ACTIVE_TTL_SECONDS,
        },
      );
      await this.redis.publish(
        this.channel(conversationId),
        JSON.stringify({ id, chunk: chunkJson }),
      );
    } catch (error) {
      this.logger.warn(`Failed to append stream chunk: ${String(error)}`);
    }
  }

  /**
   * Pushes a chunk to live resumers without recording it: for a live view
   * (browser screenshots) that only matters while it is current and is too
   * big to keep for replay.
   */
  async publishLive(conversationId: string, chunkJson: string): Promise<void> {
    try {
      await this.redis.publish(
        this.channel(conversationId),
        JSON.stringify({ live: chunkJson }),
      );
    } catch (error) {
      this.logger.warn(`Failed to publish live chunk: ${String(error)}`);
    }
  }

  /**
   * Marks the run complete: appends a done sentinel so any resumer closes, and
   * shortens the key's TTL to the late-reconnect window.
   */
  async finish(conversationId: string): Promise<void> {
    try {
      const id = await this.redis.xadd(
        this.key(conversationId),
        { done: '1' },
        { maxLen: AgentsStreamBufferService.MAX_ENTRIES },
      );
      await this.redis.expire(
        this.key(conversationId),
        AgentsStreamBufferService.DONE_TTL_SECONDS,
      );
      await this.redis.publish(
        this.channel(conversationId),
        JSON.stringify({ id, done: true }),
      );
    } catch (error) {
      this.logger.warn(`Failed to finish stream buffer: ${String(error)}`);
    }
  }

  /**
   * A resumable SSE stream of the conversation's current answer, or null when
   * there is nothing to resume (no buffer and no active run — the caller then
   * answers 204). Each emitted string is a chunk's JSON, ready to write after
   * `data: `; the stream closes on the done sentinel or when the run is gone.
   *
   * @param isRunActive Tells a still-open buffer from an abandoned one, so a
   *   run that died without a done marker does not hold the reader forever.
   */
  async createResumeStream(
    conversationId: string,
    isRunActive: () => boolean,
  ): Promise<ReadableStream<string> | null> {
    const key = this.key(conversationId);
    const channel = this.channel(conversationId);

    // A finished run has nothing to resume: the database holds the whole
    // answer, and replaying it would append it again onto the client's copy.
    const last = await this.redis.xlast(key);
    if (last?.fields.done === '1') return null;
    if (!last && !isRunActive()) return null;
    // Trimmed past its beginning: a replay would break the client
    if (last && !(await this.startsAtBegin(key))) return null;

    const redis = this.redis;
    const logger = this.logger;
    const idleCheckMs = AgentsStreamBufferService.IDLE_CHECK_MS;
    // Set by `start`, so a cancelled reader (the client left) closes it too
    let closeStream = (): void => undefined;

    return new ReadableStream<string>({
      async start(controller) {
        let lastId = '0-0';
        let closed = false;
        // When the last chunk was delivered. The run that owns the buffer may
        // live on another instance, so `isRunActive` (per-process) can read
        // false while chunks still flow over pub/sub: treat the stream as alive
        // as long as chunks keep arriving, and only drop it once it is both
        // inactive here and genuinely quiet.
        let lastActivityAt = Date.now();
        // Live messages that arrive while the backlog is being read wait here,
        // so none is lost between subscribe and the first live drain.
        const pending: string[] = [];
        let idleTimer: NodeJS.Timeout | undefined;

        const close = (): void => {
          if (closed) return;
          closed = true;
          if (idleTimer) clearInterval(idleTimer);
          // Only this reader's listener: other resumers of the conversation
          // (another tab, or the client that came back) keep theirs
          void redis.unsubscribe(channel, onMessage).catch(() => undefined);
          try {
            controller.close();
          } catch {
            // Already closed (reader cancelled): nothing to do.
          }
        };

        // Stream ids are "<ms>-<seq>"; compare numerically, not lexically, so
        // "10-0" sorts after "9-0".
        const isAfter = (a: string, b: string): boolean => {
          const [am, as] = a.split('-').map(Number);
          const [bm, bs] = b.split('-').map(Number);
          return am !== bm ? am > bm : as > bs;
        };

        const drain = (): void => {
          while (pending.length > 0 && !closed) {
            const raw = pending.shift()!;
            let msg: {
              id: string;
              chunk?: string;
              done?: boolean;
              live?: string;
            };
            try {
              msg = JSON.parse(raw) as typeof msg;
            } catch {
              continue;
            }
            if (msg.live !== undefined) {
              // Never recorded, so never replayed: no id to order by
              controller.enqueue(msg.live);
              lastActivityAt = Date.now();
              continue;
            }
            if (!isAfter(msg.id, lastId)) continue; // already replayed
            lastId = msg.id;
            if (msg.done) {
              close();
              return;
            }
            if (msg.chunk !== undefined) {
              controller.enqueue(msg.chunk);
              lastActivityAt = Date.now();
            }
          }
        };

        const onMessage = (received: string, raw: string): void => {
          if (received !== channel || closed) return;
          pending.push(raw);
          drain();
        };
        closeStream = close;

        try {
          // Subscribe BEFORE reading the backlog: anything published in between
          // is buffered in `pending` and de-duplicated by id, so there is no
          // gap between the replayed tail and the live stream.
          await redis.subscribe(channel, onMessage);

          const backlog = await redis.xrange(key);
          // Trimmed since the check above: end it rather than replay a part
          if (backlog.length > 0 && backlog[0].fields.begin !== '1') {
            close();
            return;
          }
          for (const entry of backlog) {
            if (closed) return;
            if (entry.fields.done === '1') {
              lastId = entry.id;
              close();
              return;
            }
            if (entry.fields.chunk !== undefined) {
              controller.enqueue(entry.fields.chunk);
              lastActivityAt = Date.now();
            }
            lastId = entry.id;
          }

          drain();
          if (closed) return;

          // The done sentinel normally closes the stream; this only catches a
          // run that crashed without writing one.
          idleTimer = setInterval(() => {
            if (
              !closed &&
              !isRunActive() &&
              Date.now() - lastActivityAt >= idleCheckMs
            ) {
              close();
            }
          }, idleCheckMs);
          idleTimer.unref?.();
        } catch (error) {
          logger.warn(`Resume stream failed: ${String(error)}`);
          close();
        }
      },
      cancel() {
        closeStream();
      },
    });
  }

  /** Whether the buffer still holds its begin marker (nothing was trimmed). */
  private async startsAtBegin(key: string): Promise<boolean> {
    const [first] = await this.redis.xrange(key, '-', '+', 1);
    return first?.fields.begin === '1';
  }
}
