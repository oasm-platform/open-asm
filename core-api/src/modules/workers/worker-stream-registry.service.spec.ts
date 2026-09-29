import { Test } from '@nestjs/testing';
import { Subject } from 'rxjs';
import { RedisService } from '@/services/redis/redis.service';
import {
  WORKER_STREAM_CANCEL_CHANNEL,
  WorkerStreamRegistry,
} from './worker-stream-registry.service';

describe('WorkerStreamRegistry', () => {
  let registry: WorkerStreamRegistry;
  let publish: jest.Mock;
  let handlers: Map<string, (channel: string, message: string) => void>;

  const deliver = (message: unknown) => {
    handlers.get(WORKER_STREAM_CANCEL_CHANNEL)?.(
      WORKER_STREAM_CANCEL_CHANNEL,
      JSON.stringify(message),
    );
  };

  beforeEach(async () => {
    publish = jest.fn().mockResolvedValue(1);
    handlers = new Map();
    const redis = {
      publish,
      subscribe: jest.fn(
        (channel: string, cb: (channel: string, message: string) => void) => {
          handlers.set(channel, cb);
          return Promise.resolve();
        },
      ),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;

    const module = await Test.createTestingModule({
      providers: [WorkerStreamRegistry, { provide: RedisService, useValue: redis }],
    }).compile();

    registry = module.get(WorkerStreamRegistry);
    await registry.onModuleInit();
  });

  afterEach(() => {
    registry.onModuleDestroy();
  });

  it('tracks live streams per worker', () => {
    const subject = new Subject<Record<string, unknown>>();
    expect(registry.hasStream('worker-1')).toBe(false);

    registry.register('worker-1', subject);
    expect(registry.hasStream('worker-1')).toBe(true);

    // A stale teardown must not drop a newer stream for the same worker.
    const replacement = new Subject<Record<string, unknown>>();
    registry.register('worker-1', replacement);
    registry.unregister('worker-1', subject);
    expect(registry.hasStream('worker-1')).toBe(true);

    registry.unregister('worker-1', replacement);
    expect(registry.hasStream('worker-1')).toBe(false);
  });

  it('delivers a cancel to the instance holding the worker stream', () => {
    const subject = new Subject<Record<string, unknown>>();
    const received: Record<string, unknown>[] = [];
    subject.subscribe((value) => received.push(value));
    registry.register('worker-1', subject);

    deliver({
      workerId: 'worker-1',
      jobId: 'job-1',
      reason: 'cancelled by user',
    });

    expect(received).toEqual([
      {
        cancel: {
          jobId: 'job-1',
          reason: 'cancelled by user',
          cancelledBy: undefined,
        },
      },
    ]);
  });

  it('ignores cancels for workers another instance is streaming', () => {
    deliver({ workerId: 'worker-9', jobId: 'job-1', reason: 'x' });
    // Nothing to assert beyond "no throw": this instance holds no such stream.
    expect(registry.hasStream('worker-9')).toBe(false);
  });

  it('ignores malformed and incomplete cancel payloads', () => {
    const subject = new Subject<Record<string, unknown>>();
    const received: Record<string, unknown>[] = [];
    subject.subscribe((value) => received.push(value));
    registry.register('worker-1', subject);

    handlers.get(WORKER_STREAM_CANCEL_CHANNEL)?.(
      WORKER_STREAM_CANCEL_CHANNEL,
      'not-json',
    );
    deliver({ workerId: 'worker-1' });

    expect(received).toHaveLength(0);
  });

  it('publishes cancels to every instance', async () => {
    await registry.publishCancel({
      workerId: 'worker-1',
      jobId: 'job-1',
      reason: 'run cancelled by user',
    });

    expect(publish).toHaveBeenCalledWith(
      WORKER_STREAM_CANCEL_CHANNEL,
      expect.stringContaining('"jobId":"job-1"'),
    );
  });
});
