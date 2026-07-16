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
    const result = await this.redisService.client.set(
      `${this.prefix}:${key}`,
      Date.now().toString(),
      'PX',
      ttl,
      'NX',
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
  private async acquireLock(
    key: string,
    ttl: number,
  ): Promise<string | null> {
    const lockValue = Date.now().toString();
    const result = await this.redisService.client.set(
      `${this.prefix}:${key}`,
      lockValue,
      'PX',
      ttl,
      'NX',
    );
    return result === 'OK' ? lockValue : null;
  }

  /**
   * Releases the lock associated with the given key using a Lua script
   * that verifies ownership before deleting. This prevents a process from
   * releasing another process's lock after the original TTL expired.
   *
   * @param key - The key for which the lock is to be released.
   * @param lockValue - The value that was set when the lock was acquired (ownership proof).
   * @returns A promise that resolves once the lock has been released (or skipped if not owner).
   */
  private async releaseLock(key: string, lockValue: string): Promise<void> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;
    await this.redisService.client.eval(
      script,
      1,
      `${this.prefix}:${key}`,
      lockValue,
    );
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
    const lockValue = await this.acquireLock(key, ttl);

    if (!lockValue) {
      return null;
    }

    try {
      this.logger.debug(`Lock acquired for key: ${key}`);
      return await action();
    } catch (error) {
      this.logger.error(`Error executing action for lock key: ${key}`, error);
      throw error;
    } finally {
      await this.releaseLock(key, lockValue);
    }
  }
}
