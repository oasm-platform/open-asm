import { Logger } from '@nestjs/common';
import { RedisLockService } from './distributed-lock.service';

const logger = new Logger('Lock');

export interface LockOptions {
  /**
   * Lock lifetime in milliseconds. The lock is released as soon as the method
   * settles; the TTL only bounds how long a crashed holder blocks the others,
   * so it must exceed the method's longest run.
   */
  ttl: number;
}

export interface ThrowingLockOptions extends LockOptions {
  /** Builds the error thrown when another instance holds the lock. */
  onLocked: (key: string) => Error;
}

/** A fixed lock key, or one built from the decorated method's arguments. */
export type LockKey<A extends unknown[]> = string | ((...args: A) => string);

/** An async method whose leading parameters match the key builder's. */
type AsyncMethod<A extends unknown[]> = (
  ...args: [...A, ...never[]]
) => Promise<unknown>;

/**
 * Without `onLocked`, a call that loses the lock resolves to `undefined`, so
 * the method's own return type has to admit it — otherwise a caller would
 * receive `undefined` typed as a value.
 */
type SkippableMethod<T extends (...args: never) => Promise<unknown>> =
  undefined extends Awaited<ReturnType<T>>
    ? T
    : {
        __lockError: 'Without onLocked a skipped call resolves to undefined: return Promise<T | undefined> or pass onLocked';
      };

/**
 * Runs the decorated async method under a distributed lock, so only one
 * instance executes it at a time across every API replica.
 *
 * When another instance holds the lock the call resolves to `undefined`
 * without running, or throws `onLocked(key)` when that option is given. The
 * lock is not reentrant: a locked method calling another method under the
 * same key skips that inner call.
 *
 * @example
 * @Cron('30 3 * * *')
 * @Lock('cron:jobs-retention', { ttl: 30 * 60_000 })
 * async pruneExpiredJobs(): Promise<void> {}
 *
 * @Lock((target: Target) => `repository-sync:${target.id}`, { ttl: 600_000 })
 * async syncTarget(target: Target): Promise<SyncResult | undefined> {}
 *
 * @Lock('admin:first', {
 *   ttl: 60_000,
 *   onLocked: () => new ConflictException('Admin initialization already in progress'),
 * })
 * private async bootstrapAdmin(email: string, password: string): Promise<true> {}
 */
export function Lock<A extends unknown[] = never[]>(
  key: LockKey<A>,
  options: ThrowingLockOptions,
): <T extends AsyncMethod<A>>(
  target: object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>,
) => void;
export function Lock<A extends unknown[] = never[]>(
  key: LockKey<A>,
  options: LockOptions,
): <T extends AsyncMethod<A>>(
  target: object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<SkippableMethod<T>>,
) => void;
export function Lock(
  key: LockKey<unknown[]>,
  options: LockOptions & { onLocked?: (key: string) => Error },
) {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): void => {
    const original = descriptor.value as (
      ...args: unknown[]
    ) => Promise<unknown>;
    const label = `${target.constructor.name}.${String(propertyKey)}`;

    const locked = async function (this: unknown, ...args: unknown[]) {
      const lockKey = typeof key === 'function' ? key(...args) : key;
      // Boxed so a method that legitimately resolves to null is not mistaken
      // for a lost lock, which withLock reports as null.
      const outcome = await RedisLockService.current.withLock(
        lockKey,
        options.ttl,
        async () => {
          const value: unknown = await original.apply(this, args);
          return { value };
        },
      );
      if (outcome === null) {
        if (options.onLocked) {
          throw options.onLocked(lockKey);
        }
        logger.debug(`${label} skipped: lock "${lockKey}" is held elsewhere`);
        return undefined;
      }
      return outcome.value;
    };

    // Decorators written below @Lock run first and have already put their
    // metadata (@Cron's included) on the original function; without copying
    // it, Nest would no longer see them on the replacement.
    for (const metadataKey of Reflect.getOwnMetadataKeys(original)) {
      Reflect.defineMetadata(
        metadataKey,
        Reflect.getOwnMetadata(metadataKey, original),
        locked,
      );
    }
    descriptor.value = locked;
  };
}
