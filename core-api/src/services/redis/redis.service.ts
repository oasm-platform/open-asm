/* eslint-disable */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

type MessageCallback = (channel: string, message: string) => void;

/**
 * One Redis Stream entry as the event bus sees it: the entry id (which orders
 * the entry and is what a consumer group acknowledges) plus its flattened
 * field map. Redis returns fields as a flat `[field, value, …]` array; the
 * stream helpers below fold it back into an object so a consumer never has to
 * deal with the positional encoding.
 */
export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

/**
 * RedisService provides a wrapper around ioredis
 * to simplify publishing, subscribing, and key management.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  /**
   * Redis client instance for general commands.
   */
  public readonly client: Redis;

  /**
   * Dedicated Redis client instance for caching operations (get/set/setex).
   * This is separate from pub/sub to avoid "subscriber mode" conflicts.
   */
  public readonly cacheClient: Redis;

  /**
   * Redis client instance for publishing messages.
   */
  public readonly publisher: Redis;

  /**
   * Redis client instance for subscribing to messages.
   */
  public readonly subscriber: Redis;

  /**
   * Track callbacks per channel so they can be properly removed on unsubscribe.
   */
  private readonly channelCallbacks = new Map<string, Set<MessageCallback>>();

  /**
   * Dedicated connections for BLOCKING commands, keyed by consumer group.
   *
   * WHY A SEPARATE CONNECTION IS REQUIRED, NOT A NICETY: a blocking Redis
   * command (`XREADGROUP ... BLOCK`) parks the socket until data arrives or the
   * timeout expires. Every other command multiplexed onto that same socket waits
   * in the queue behind it. Sharing the general-purpose connection therefore
   * does not merely slow the bus down — it stalls the WHOLE application's Redis
   * traffic (sessions, cache, rate limits, locks, and the producer's own XADD)
   * for the duration of every block.
   *
   * Measured with four consumer lanes at a 5s block, that surfaced as audit
   * rows landing 4-29 seconds after the request that caused them.
   *
   * Keyed by group because that is exactly what distinguishes one blocked
   * reader from another: two lanes sharing a connection would simply move the
   * same queueing from the application's traffic onto the bus's traffic. The map
   * is bounded by the number of lanes (4), not by traffic, so it cannot grow.
   */
  private readonly blockingClients = new Map<string, Redis>();

  constructor(private readonly configService: ConfigService) {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      if (!redisUrl) {
        throw new Error('REDIS_URL is not defined in environment variables');
      }

      this.client = new Redis(redisUrl);
      this.cacheClient = this.client.duplicate();
      this.publisher = this.client.duplicate();
      this.subscriber = this.client.duplicate();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize Redis client: ${errorMessage}`);
    }
  }

  /**
   * Wait for Redis connections to be ready before proceeding
   */
  async onModuleInit(): Promise<void> {
    try {
      // Wait for all Redis clients to be ready
      await Promise.all([
        this.waitForClientReady(this.client),
        this.waitForClientReady(this.cacheClient),
        this.waitForClientReady(this.publisher),
        this.waitForClientReady(this.subscriber),
      ]);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to establish Redis connections: ${errorMessage}`);
    }
  }

  /**
   * Wait for a Redis client to be ready
   */
  private async waitForClientReady(client: Redis): Promise<void> {
    return new Promise((resolve, reject) => {
      if (client.status === 'ready') {
        resolve();
        return;
      }

      client.once('ready', () => resolve());
      client.once('error', reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        client.removeListener('ready', resolve);
        client.removeListener('error', reject);
        reject(new Error('Redis connection timeout'));
      }, 30000);
    });
  }

  /**
   * Cleanup Redis connections when module is destroyed
   */
  async onModuleDestroy(): Promise<void> {
    try {
      this.unsubscribeAll();
      await Promise.all([
        this.client?.disconnect(),
        this.cacheClient?.disconnect(),
        this.publisher?.disconnect(),
        this.subscriber?.disconnect(),
        // Lazily created blocking readers: a disconnected one would otherwise
        // leak a socket for the lifetime of the process.
        ...[...this.blockingClients.values()].map((c) => c.disconnect()),
      ]);
    } catch (error: unknown) {
      // Log error but don't throw to avoid blocking shutdown
      // Using process.env.NODE_ENV check to allow console.error in non-production environments
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error during Redis cleanup:', error);
      }
    }
  }

  /**
   * Waits for a single event from a Redis channel.
   *
   * @param channel - Redis channel name
   * @param timeout - Maximum wait time in ms (default: 5000ms = 5 seconds)
   * @returns The received message or null if timed out
   */
  async waitForEvent(channel: string, timeout = 5000): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          resolve(null);
        }
      }, timeout);

      this.subscribe(channel, (receivedChannel: string, message: string) => {
        if (receivedChannel === channel && !isResolved) {
          isResolved = true;
          clearTimeout(timer);
          resolve(message);
        }
      }).catch((error: unknown) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          if (process.env.NODE_ENV !== 'production') {
            console.error(`Failed to subscribe to channel ${channel}:`, error);
          }
          resolve(null);
        }
      });
    });
  }

  /**
   * Removes all keys matching the given prefix pattern.
   *
   * The script uses the KEYS command to retrieve all keys matching the pattern,
   * deletes them, and returns the number of deleted keys.
   *
   * @param prefix - The key pattern to match (e.g., "orders:*")
   * @returns A promise that resolves with the number of deleted keys
   */
  public async removeKeyWithPrefix(prefix: string): Promise<number> {
    try {
      const luaScript = `
        local keys = redis.call('KEYS', ARGV[1])
        local deleted = 0
        for i = 1, #keys do
          redis.call('DEL', keys[i])
          deleted = deleted + 1
        end
        return deleted
      `;

      const result = await this.client.eval(luaScript, 0, prefix);
      const deleted = typeof result === 'number' ? result : 0;
      return deleted;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to remove keys with prefix ${prefix}: ${errorMessage}`,
      );
    }
  }

  /**
   * Publishes a message to a Redis channel
   *
   * @param channel - Redis channel name
   * @param message - Message to publish
   * @returns Number of subscribers that received the message
   */
  public async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.publisher.publish(channel, message);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to publish message to channel ${channel}: ${errorMessage}`,
      );
    }
  }

  /**
   * Subscribe to a Redis channel
   *
   * @param channel - Redis channel name
   * @param callback - Function to handle received messages
   */
  public async subscribe(
    channel: string,
    callback: MessageCallback,
  ): Promise<void> {
    try {
      // Register the listener BEFORE subscribe to prevent race condition:
      // messages published between subscribe ack and listener registration
      // would otherwise be lost.
      if (!this.channelCallbacks.has(channel)) {
        this.channelCallbacks.set(channel, new Set());
      }
      this.channelCallbacks.get(channel)!.add(callback);
      this.subscriber.on('message', callback);

      await this.subscriber.subscribe(channel);
    } catch (error) {
      // Rollback: remove the listener we just registered
      this.subscriber.removeListener('message', callback);
      const callbacks = this.channelCallbacks.get(channel);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.channelCallbacks.delete(channel);
        }
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to subscribe to channel ${channel}: ${errorMessage}`,
      );
    }
  }

  /**
   * Unsubscribe from a Redis channel
   * Removes all registered callbacks for this channel to prevent memory leaks.
   *
   * @param channel - Redis channel name
   */
  public async unsubscribe(channel: string): Promise<void> {
    try {
      const callbacks = this.channelCallbacks.get(channel);
      if (callbacks) {
        for (const callback of callbacks) {
          this.subscriber.removeListener('message', callback);
        }
        this.channelCallbacks.delete(channel);
      }
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to unsubscribe from channel ${channel}: ${errorMessage}`,
      );
    }
  }

  /**
   * Unsubscribe from all channels and remove all listeners.
   * Called during module destruction to prevent memory leaks.
   */
  public unsubscribeAll(): void {
    for (const [channel, callbacks] of this.channelCallbacks) {
      for (const callback of callbacks) {
        this.subscriber.removeListener('message', callback);
      }
    }
    this.channelCallbacks.clear();
  }

  /**
   * Atomic increment operation
   *
   * @param key - Redis key name
   * @returns The value after increment
   */
  public async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to increment key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Atomic decrement operation
   *
   * @param key - Redis key name
   * @returns The value after decrement
   */
  public async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to decrement key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Get value from Redis
   *
   * @param key - Redis key name
   * @returns The value or null if key doesn't exist
   */
  public async get(key: string): Promise<string | null> {
    try {
      return await this.cacheClient.get(key);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Set value in Redis
   *
   * @param key - Redis key name
   * @param value - Value to set
   * @returns OK if successful
   */
  public async set(
    key: string,
    value: string | number,
  ): Promise<string | null> {
    try {
      return await this.cacheClient.set(key, value.toString());
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to set key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Set a string value and its expiry in one atomic Redis operation.
   *
   * @param key - Redis key name
   * @param seconds - Expiry time in seconds
   * @param value - Value to set
   * @returns OK if successful
   */
  public async setWithExpiry(
    key: string,
    seconds: number,
    value: string | number,
  ): Promise<string> {
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new Error('Redis expiry seconds must be a positive integer');
    }
    try {
      return await this.cacheClient.set(
        key,
        value.toString(),
        'EX',
        seconds,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to set key with expiry ${key}: ${errorMessage}`,
      );
    }
  }

  /**
   * Set value in Redis with expiry (seconds)
   *
   * @param key - Redis key name
   * @param seconds - Expiry time in seconds
   * @param value - Value to set
   * @returns OK if successful
   */
  public async setex(
    key: string,
    seconds: number,
    value: string | number,
  ): Promise<string> {
    try {
      return await this.cacheClient.setex(key, seconds, value.toString());
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to setex key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Appends an entry to a stream and returns its generated id.
   *
   * Uses `client`, not `subscriber`: a connection in subscriber mode rejects
   * every command except (P)SUBSCRIBE, and XADD is a write. That constraint is
   * the reason this service keeps a dedicated subscriber connection at all.
   *
   * `*` lets Redis assign the id, which is what orders the entry and lets a
   * consumer group acknowledge it by id.
   *
   * Retention is applied HERE, on every write, rather than by a periodic
   * sweep: an unbounded stream evicts by MAXLEN only when the trim runs, so a
   * quiet stream would hold entries past their TTL. Passing both keeps the
   * stream bounded between sweeps.
   *
   * @param stream - Redis stream key
   * @param fields - Flat field→value map; every value must be a string
   * @param options - `maxLen` (approximate trim) and `ttlSeconds` (key expiry)
   * @returns The stream entry id
   */
  public async xadd(
    stream: string,
    fields: Record<string, string>,
    options: { maxLen?: number; ttlSeconds?: number } = {},
  ): Promise<string> {
    const pairs: string[] = [];
    for (const [field, value] of Object.entries(fields)) {
      pairs.push(field, value);
    }

    const { maxLen, ttlSeconds } = options;
    // Argument ORDER is part of the XADD grammar, not a style choice:
    //   XADD key [MAXLEN [~|=] count] <* | id> field value [field value ...]
    // The trim clause precedes the id, and the fields follow it. Appending
    // MAXLEN after the fields is not a slower trim — Redis rejects the whole
    // command with "ERR wrong number of arguments", so the event is never
    // written at all.
    const id = maxLen
      ? await this.client.xadd(
          stream,
          'MAXLEN',
          '~',
          String(maxLen),
          '*',
          ...pairs,
        )
      : await this.client.xadd(stream, '*', ...pairs);

    if (id === null) {
      throw new Error(`XADD to ${stream} returned no entry id`);
    }

    // EXPIRE after XADD so a stream that just received its first entry gets a
    // full TTL window; setting it before would leave the newest entry with a
    // nearly-expired key.
    if (ttlSeconds) {
      await this.client.expire(stream, ttlSeconds);
    }
    return id;
  }

  /**
   * Creates a consumer group, ignoring the error when it already exists.
   *
   * BUSYGROUP is the normal path on every boot after the first (the group is
   * durable Redis state that outlives the process), so swallowing exactly that
   * error is what makes this idempotent rather than a boot-time failure.
   */
  public async xgroupCreate(
    stream: string,
    group: string,
    id: string,
  ): Promise<void> {
    try {
      await this.client.xgroup('CREATE', stream, group, id, 'MKSTREAM');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  /**
   * Reads entries never delivered to this group.
   *
   * `id: '>'` reads only NEW entries, which is the distinction that makes a
   * consumer group durable: entries the previous consumer received but died
   * before acknowledging are NOT returned here — they sit in the group's
   * pending list until {@link xautoclaim} hands them over.
   */
  /**
   * Connection reserved for a given consumer group's blocking reads.
   *
   * Created lazily and cached: ioredis queues commands issued before the socket
   * is ready, so there is no need to await readiness here, and `onModuleDestroy`
   * disconnects everything that was handed out.
   */
  private blockingClientFor(group: string): Redis {
    const existing = this.blockingClients.get(group);
    if (existing) return existing;
    const client = this.client.duplicate();
    this.blockingClients.set(group, client);
    return client;
  }

  public async xreadgroup(
    stream: string,
    group: string,
    consumer: string,
    count: number,
    blockMs: number,
  ): Promise<StreamEntry[]> {
    // Deliberately NOT `this.client` — see `blockingClients`.
    const response = (await this.blockingClientFor(group).xreadgroup(
      'GROUP',
      group,
      consumer,
      'COUNT',
      String(count),
      'BLOCK',
      String(blockMs),
      'STREAMS',
      stream,
      '>',
    )) as [string, [string, string[]][]][] | null;

    const entries = response?.[0]?.[1] ?? [];
    return entries.map(([entryId, values]) => {
      const fields: Record<string, string> = {};
      // Redis returns a flat [field, value, field, value, …] array.
      for (let i = 0; i < values.length; i += 2) {
        fields[values[i]] = values[i + 1];
      }
      return { id: entryId, fields };
    });
  }

  /**
   * Claims entries idle for at least `minIdleMs` and hands them to `consumer`.
   *
   * This is the retry path: an entry whose handler threw stays in the group's
   * PEL, and this is what moves it to a live consumer so the attempt counter
   * can advance toward the DLQ.
   */
  public async xautoclaim(
    stream: string,
    group: string,
    consumer: string,
    minIdleMs: number,
    count: number,
  ): Promise<StreamEntry[]> {
    const [, entries] = (await this.client.xautoclaim(
      stream,
      group,
      consumer,
      String(minIdleMs),
      '0-0',
      'COUNT',
      String(count),
    )) as [string, [string, string[]][]];

    return entries.map(([entryId, values]) => {
      const fields: Record<string, string> = {};
      for (let i = 0; i < values.length; i += 2) {
        fields[values[i]] = values[i + 1];
      }
      return { id: entryId, fields };
    });
  }

  /**
   * How many times a pending entry has already been delivered, 0 when the id
   * is not in the group's PEL. Drives the DLQ decision — an entry delivered
   * EVENT_BUS_MAX_ATTEMPTS times is not retried again.
   *
   * Reply SHAPE matters here: with an explicit range, XPENDING answers with a
   * flat list of `[entryId, consumerName, idleMs, deliveryCount]` rows — NOT the
   * `[count, minId, maxId, consumers]` of the summary form. Reading [3][0][1]
   * silently yields 0, which looks like "first attempt" forever and means the
   * DLQ threshold is never reached.
   */
  public async xpendingCount(
    stream: string,
    group: string,
    entryId: string,
  ): Promise<number> {
    const entries = (await this.client.xpending(
      stream,
      group,
      entryId,
      entryId,
      1,
    )) as [string, string, number, number][] | null;

    return entries?.[0]?.[3] ?? 0;
  }

  /** Acknowledges an entry, removing it from the group's pending list. */
  public async xack(
    stream: string,
    group: string,
    entryId: string,
  ): Promise<number> {
    return this.client.xack(stream, group, entryId);
  }

  /**
   * `SET key value NX` — sets only when absent, returning whether it won.
   *
   * The primitive idempotency needs on a transport that delivers at-least-once:
   * exactly one caller observes `true` for a given key, whoever gets there
   * first, with no read-then-write race.
   */
  public async setIfAbsent(key: string, value: string): Promise<boolean> {
    const result = await this.client.set(key, value, 'NX');
    return result === 'OK';
  }

  /**
   * Delete key from Redis
   *
   * @param key - Redis key name
   * @returns Number of keys deleted (0 or 1)
   */
  public async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete key ${key}: ${errorMessage}`);
    }
  }
}
