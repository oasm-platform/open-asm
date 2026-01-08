import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly prefix = 'distributed-lock';

  constructor(private redisService: RedisService) {}
  /**
   * Acquires a lock with the given key and TTL.
   *
   * This method attempts to set a value in Redis with the given key and TTL.
   * If the key already exists, the method will return false, indicating that
   * the lock was not acquired. If the key is not set, the method returns true,
   * indicating that the lock was acquired.
   *
   * @param key - The key to use for the lock.
   * @param ttl - The TTL for the lock in milliseconds.
   * @returns A promise that resolves to true if the lock was acquired, otherwise false.
   */
  public async lockWithTimeOut(key: string, ttl: number): Promise<boolean> {
    const lockValue = Date.now().toString();
    const result = await this.redisService.client.set(
      `${this.prefix}:${key}`,
      lockValue,
      'PX',
      ttl,
    );
    return result === 'OK';
  }

  /**
   * Checks if a lock is absent for the given key.
   *
   * This method queries the Redis database to determine whether a lock
   * associated with the specified key is present. If the lock is absent,
   * it returns true; otherwise, it returns false.
   *
   * @param key - The key to check for an associated lock.
   * @returns A promise that resolves to true if there is no lock, otherwise false.
   */

  public async isWithoutLock(key: string): Promise<boolean> {
    const lockValue = await this.redisService.client.get(
      `${this.prefix}:${key}`,
    );
    return !lockValue;
  }
  /**
   * Acquires a lock with the given key and TTL using Redis SET NX PX.
   *
   * This method uses the atomic SET command with NX (only set if not exists)
   * and PX (milliseconds TTL) options to ensure thread-safe lock acquisition.
   *
   * @param key - The key to use for the lock.
   * @param ttl - The TTL for the lock in milliseconds.
   * @returns A promise that resolves to true if the lock was acquired, otherwise false.
   */
  private async acquireLock(key: string, ttl: number): Promise<boolean> {
    const lockValue = Date.now().toString();
    const result = await this.redisService.client.set(
      `${this.prefix}:${key}`,
      lockValue,
      'PX',
      ttl,
      'NX',
    );
    return result === 'OK';
  }

  /**
   * Releases the lock associated with the given key.
   *
   * This method deletes the lock entry from Redis, effectively releasing
   * the lock. It ensures that the key is no longer marked as locked, allowing
   * other operations to acquire the lock if necessary.
   *
   * @param key - The key for which the lock is to be released.
   * @returns A promise that resolves once the lock has been released.
   */
  private async releaseLock(key: string): Promise<void> {
    await this.redisService.client.del(`${this.prefix}:${key}`);
  }

  /**
   * Executes a function with distributed lock protection.
   *
   * This method acquires a lock, executes the provided action, and ensures
   * the lock is released even if the action throws an error. If the lock
   * cannot be acquired, it returns null.
   *
   * @param key - The key to use for the lock.
   * @param ttl - The TTL for the lock in milliseconds.
   * @param action - The action to execute if the lock is acquired.
   * @returns A promise that resolves to the result of the action if the lock is
   *          acquired, otherwise null.
   */
  async withLock<T>(
    key: string,
    ttl: number,
    action: () => Promise<T>,
  ): Promise<T | null> {
    const acquired = await this.acquireLock(key, ttl);

    if (!acquired) {
      return null;
    }

    try {
      this.logger.debug(`Lock acquired for key: ${key}`);
      const result = await action();
      this.logger.debug(`Lock released for key: ${key}`);
      return result;
    } catch (error) {
      this.logger.error(`Error executing action for lock key: ${key}`, error);
      throw error;
    } finally {
      await this.releaseLock(key);
    }
  }
}
