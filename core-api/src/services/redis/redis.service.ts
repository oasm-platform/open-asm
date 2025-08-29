/* eslint-disable */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * RedisService provides a wrapper around ioredis
 * to simplify publishing, subscribing, and key management.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  /**
   * Redis client instance for general commands.
   */
  public readonly client: Redis;

  /**
   * Redis client instance for publishing messages.
   */
  public readonly publisher: Redis;

  /**
   * Redis client instance for subscribing to messages.
   */
  public readonly subscriber: Redis;

  constructor(private readonly configService: ConfigService) {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      if (!redisUrl) {
        throw new Error('REDIS_URL is not defined in environment variables');
      }

      this.client = new Redis(redisUrl);
      this.publisher = this.client;
      this.subscriber = this.client.duplicate();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize Redis client: ${errorMessage}`);
    }
  }

  /**
   * Cleanup Redis connections when module is destroyed
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await Promise.all([
        this.client?.disconnect(),
        this.subscriber?.disconnect(),
      ]);
    } catch (error: unknown) {
      // Log error but don't throw to avoid blocking shutdown
      // Using process.env.NODE_ENV check to allow console.error in non-production environments
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
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
    // eslint-disable-line no-magic-numbers
    return new Promise<string | null>((resolve) => {
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.subscriber.removeListener('message', onMessage);
          resolve(null);
        }
      }, timeout);

      const onMessage = (receivedChannel: string, message: string): void => {
        if (receivedChannel === channel && !isResolved) {
          isResolved = true;
          clearTimeout(timer);
          this.subscriber.removeListener('message', onMessage);
          resolve(message);
        }
      };

      // Subscribe to channel first
      this.subscriber.subscribe(channel).catch((error: unknown) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          // Using process.env.NODE_ENV check to allow console.error in non-production environments
          if (process.env.NODE_ENV !== 'production') {
            console.error(`Failed to subscribe to channel ${channel}:`, error);
          }
          resolve(null);
        }
      });

      this.subscriber.on('message', onMessage);
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
    callback: (channel: string, message: string) => void,
  ): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', callback);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to subscribe to channel ${channel}: ${errorMessage}`,
      );
    }
  }

  /**
   * Unsubscribe from a Redis channel
   *
   * @param channel - Redis channel name
   */
  public async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to unsubscribe from channel ${channel}: ${errorMessage}`,
      );
    }
  }
}
