/* eslint-disable @typescript-eslint/require-await */
import { SetMetadata } from '@nestjs/common';
import { RedisLockService } from './distributed-lock.service';
import { Lock } from './lock.decorator';

describe('Lock', () => {
  const withLock = jest.fn();

  beforeEach(() => {
    withLock.mockImplementation(
      async (_key: string, _ttl: number, action: () => Promise<unknown>) =>
        action(),
    );
    jest
      .spyOn(RedisLockService, 'current', 'get')
      .mockReturnValue({ withLock } as unknown as RedisLockService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    withLock.mockReset();
  });

  class Jobs {
    calls = 0;

    @Lock('cron:daily', { ttl: 1_000 })
    async daily(): Promise<number | undefined> {
      this.calls++;
      return this.calls;
    }

    @Lock((id: string) => `sync:${id}`, { ttl: 2_000 })
    async sync(id: string, label: string): Promise<string | undefined> {
      return `${id}:${label}`;
    }

    @Lock('admin:first', {
      ttl: 3_000,
      onLocked: (key) => new Error(`busy ${key}`),
    })
    async bootstrap(): Promise<null> {
      return null;
    }

    @Lock('cron:fails', { ttl: 1_000 })
    async fails(): Promise<void> {
      throw new Error('boom');
    }

    // Same order as `@Cron(...)` written above `@Lock(...)`.
    @SetMetadata('schedule', 'above')
    @Lock('cron:above', { ttl: 1_000 })
    async above(): Promise<void> {}

    // `@Cron(...)` written below `@Lock(...)` writes onto the original method.
    @Lock('cron:below', { ttl: 1_000 })
    @SetMetadata('schedule', 'below')
    async below(): Promise<void> {}
  }

  it('runs the method under the key and TTL, keeping `this`', async () => {
    const jobs = new Jobs();

    await expect(jobs.daily()).resolves.toBe(1);
    expect(withLock).toHaveBeenCalledWith(
      'cron:daily',
      1_000,
      expect.any(Function),
    );
    expect(jobs.calls).toBe(1);
  });

  it('builds the key from the method arguments', async () => {
    await expect(new Jobs().sync('t1', 'repo')).resolves.toBe('t1:repo');
    expect(withLock).toHaveBeenCalledWith(
      'sync:t1',
      2_000,
      expect.any(Function),
    );
  });

  it('skips the method and resolves undefined when the lock is held', async () => {
    withLock.mockResolvedValue(null);
    const jobs = new Jobs();

    await expect(jobs.daily()).resolves.toBeUndefined();
    expect(jobs.calls).toBe(0);
  });

  it('throws the onLocked error when the lock is held', async () => {
    withLock.mockResolvedValue(null);

    await expect(new Jobs().bootstrap()).rejects.toThrow('busy admin:first');
  });

  it('returns a null result as-is instead of treating it as a held lock', async () => {
    await expect(new Jobs().bootstrap()).resolves.toBeNull();
  });

  it('propagates errors thrown by the method', async () => {
    await expect(new Jobs().fails()).rejects.toThrow('boom');
  });

  it('keeps metadata from decorators on either side', () => {
    expect(Reflect.getMetadata('schedule', Jobs.prototype.above)).toBe(
      'above',
    );
    expect(Reflect.getMetadata('schedule', Jobs.prototype.below)).toBe(
      'below',
    );
  });
});
