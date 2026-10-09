import { EventBusGroup } from '@/common/enums/enum';
import type { RedisService } from '@/services/redis/redis.service';
import { AuditSinkService } from './audit-sink.service';

/**
 * A consumer group lives ON the stream key, so anything that removes the key
 * removes the group with it. The failure this guards against is the quiet kind:
 * `onModuleInit` only runs at boot, so a lane that loses its group without
 * recovery stops consuming FOREVER while the API keeps returning 200 and the
 * audit trail silently stops growing.
 */
describe('StreamConsumerService group recovery', () => {
  let xreadgroup: jest.Mock;
  let xgroupCreate: jest.Mock;
  let service: AuditSinkService;

  beforeEach(() => {
    xgroupCreate = jest.fn().mockResolvedValue(undefined);
    xreadgroup = jest.fn().mockRejectedValue(
      new Error(
        "NOGROUP No such key 'oasm:events' or consumer group 'audit'",
      ),
    );

    service = new AuditSinkService(
      {
        xreadgroup,
        xgroupCreate,
        xautoclaim: jest.fn().mockResolvedValue([]),
        xack: jest.fn().mockResolvedValue(1),
      } as unknown as RedisService,
      {
        withLock: jest.fn(
          (_key: string, _ttl: number, fn: () => Promise<void>) => fn(),
        ),
      } as never,
      { createQueryBuilder: jest.fn() } as never,
    );
  });

  afterEach(() => service.stop());

  it('recreates the group when Redis reports it missing', async () => {
    await service.runOnce();

    expect(xgroupCreate).toHaveBeenCalledWith(
      'oasm:events',
      EventBusGroup.Audit,
      // From 0: if the stream merely lost its group, surviving entries must
      // still be materialized rather than skipped.
      '0',
    );
  });

  it('does not throw after recovering, so the loop keeps running', async () => {
    await expect(service.runOnce()).resolves.toBeUndefined();
  });

  it('does not attempt recovery for an unrelated failure', async () => {
    xreadgroup.mockRejectedValue(new Error('READONLY You cannot write'));

    await expect(service.runOnce()).rejects.toThrow('READONLY');
    expect(xgroupCreate).not.toHaveBeenCalled();
  });

  it('swallows BUSYGROUP when another replica recreated it first', async () => {
    // The healthy outcome for a multi-replica race, not an error to log loudly.
    xgroupCreate.mockRejectedValue(
      new Error('BUSYGROUP Consumer Group name already exists'),
    );

    await expect(service.runOnce()).resolves.toBeUndefined();
  });
});