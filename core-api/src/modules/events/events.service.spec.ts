import type { RedisService, StreamEntry } from '@/services/redis/redis.service';
import type { MessageEvent } from '@nestjs/common';
import { isClientEvent } from './client-events';
import { EventsService } from './events.service';

type OnMessage = (channel: string, message: string) => void;

const flush = () => new Promise((resolve) => setImmediate(resolve));
const never = () => new Promise<StreamEntry[]>(() => undefined);

function entry(
  id: string,
  type: string,
  data: Record<string, unknown>,
): StreamEntry {
  return {
    id: `${id}-0`,
    fields: {
      id,
      type,
      time: '2026-10-17T00:00:00.000Z',
      data: JSON.stringify({ outcome: 'success', ...data }),
    },
  };
}

describe('isClientEvent', () => {
  it('matches whole domains and exact names', () => {
    const allowlist = ['worker.*', 'job.completed'];
    expect(isClientEvent('worker.joined', allowlist)).toBe(true);
    expect(isClientEvent('worker.network.connected', allowlist)).toBe(true);
    expect(isClientEvent('job.completed', allowlist)).toBe(true);
  });

  it('rejects everything else', () => {
    const allowlist = ['worker.*', 'job.completed'];
    expect(isClientEvent('job.failed', allowlist)).toBe(false);
    expect(isClientEvent('workers.joined', allowlist)).toBe(false);
    expect(isClientEvent('worker', allowlist)).toBe(false);
  });

  it('keeps sensitive domains out of the default allowlist', () => {
    expect(isClientEvent('workspace.api_key.rotated')).toBe(false);
    expect(isClientEvent('member.permissions.updated')).toBe(false);
    expect(isClientEvent('notification.created')).toBe(true);
  });
});

describe('EventsService', () => {
  let service: EventsService;
  let redis: {
    xlast: jest.Mock;
    xread: jest.Mock;
    psubscribe: jest.Mock;
  };

  const onNotification = (): OnMessage =>
    (redis.psubscribe.mock.calls[0] as [string, OnMessage])[1];

  beforeEach(() => {
    redis = {
      xlast: jest.fn().mockResolvedValue({ id: '5-0', fields: {} }),
      xread: jest.fn().mockImplementation(never),
      psubscribe: jest.fn().mockResolvedValue(undefined),
    };
    service = new EventsService(redis as unknown as RedisService);
  });

  afterEach(() => service.onModuleDestroy());

  it('forwards attributable, allowlisted events of its workspace as ids only', async () => {
    redis.xread.mockResolvedValueOnce([
      entry('e1', 'worker.joined', {
        workspaceId: 'ws-1',
        resourceType: 'worker',
        resourceId: 'w-1',
        actor: { email: 'someone@example.com' },
        payload: { secret: 'x' },
      }),
      entry('e2', 'worker.joined', { workspaceId: 'ws-2', resourceId: 'w-2' }),
      entry('e3', 'workspace.api_key.rotated', { workspaceId: 'ws-1' }),
      entry('e4', 'worker.joined', { workspaceId: 'ws-1', outcome: undefined }),
    ]);

    const received: MessageEvent[] = [];
    const subscription = service
      .stream('ws-1', 'user-1')
      .subscribe((event) => received.push(event));
    await flush();
    subscription.unsubscribe();

    expect(redis.xread).toHaveBeenCalledWith(
      'oasm:events',
      expect.any(String),
      '5-0',
      expect.any(Number),
      expect.any(Number),
    );
    expect(received).toEqual([
      {
        data: {
          id: 'e1',
          type: 'worker.joined',
          time: '2026-10-17T00:00:00.000Z',
          resourceType: 'worker',
          resourceId: 'w-1',
        },
      },
    ]);
  });

  it('forwards joinKeyId from metadata, and nothing else of it', async () => {
    redis.xread.mockResolvedValueOnce([
      entry('e1', 'worker.joined', {
        workspaceId: 'ws-1',
        resourceType: 'worker',
        resourceId: 'w-1',
        metadata: { joinKeyId: 'jk-1', other: 'hidden' },
      }),
      entry('e2', 'worker.joined', {
        workspaceId: 'ws-1',
        resourceId: 'w-2',
        metadata: { joinKeyId: 42 },
      }),
    ]);

    const received: MessageEvent[] = [];
    const subscription = service
      .stream('ws-1', 'user-1')
      .subscribe((event) => received.push(event));
    await flush();
    subscription.unsubscribe();

    expect(received.map((event) => event.data)).toEqual([
      {
        id: 'e1',
        type: 'worker.joined',
        time: '2026-10-17T00:00:00.000Z',
        resourceType: 'worker',
        resourceId: 'w-1',
        joinKeyId: 'jk-1',
      },
      {
        id: 'e2',
        type: 'worker.joined',
        time: '2026-10-17T00:00:00.000Z',
        resourceId: 'w-2',
      },
    ]);
  });

  it('keeps reading when the first xlast fails', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    redis.xlast
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValue({ id: '7-0', fields: {} });

    const subscription = service.stream('ws-1', 'user-1').subscribe();
    await flush();
    await jest.advanceTimersByTimeAsync(1_000);
    subscription.unsubscribe();
    jest.useRealTimers();

    expect(redis.xread).toHaveBeenCalledWith(
      'oasm:events',
      expect.any(String),
      '7-0',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('forwards the user\'s notification pushes, even without a workspace', () => {
    const received: MessageEvent[] = [];
    const subscription = service
      .stream(undefined, 'user-1')
      .subscribe((event) => received.push(event));

    expect(redis.psubscribe).toHaveBeenCalledWith(
      'notification:*',
      expect.any(Function),
    );
    expect(redis.xread).not.toHaveBeenCalled();

    onNotification()('notification:user-2', JSON.stringify({ notificationId: 'n-0' }));
    onNotification()(
      'notification:user-1',
      JSON.stringify({ notificationId: 'n-1', metadata: {} }),
    );
    subscription.unsubscribe();

    expect(received).toEqual([
      {
        data: expect.objectContaining({
          id: 'n-1',
          type: 'notification.created',
          resourceType: 'notification',
          resourceId: 'n-1',
        }),
      },
    ]);
  });

  it('subscribes to notifications once for all connections', () => {
    const a = service.stream('ws-1', 'user-1').subscribe();
    const b = service.stream('ws-1', 'user-2').subscribe();
    const c = service.stream(undefined, 'user-1').subscribe();

    expect(redis.psubscribe).toHaveBeenCalledTimes(1);
    [a, b, c].forEach((subscription) => subscription.unsubscribe());
  });

  it('retries a failed notification subscription on the next connection', async () => {
    redis.psubscribe.mockRejectedValueOnce(new Error('redis down'));

    service.stream(undefined, 'user-1').subscribe().unsubscribe();
    await flush();
    const subscription = service.stream(undefined, 'user-1').subscribe();

    expect(redis.psubscribe).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('stops delivering to a tab once it disconnects', () => {
    const first: MessageEvent[] = [];
    const second: MessageEvent[] = [];
    const a = service.stream(undefined, 'user-1').subscribe((e) => first.push(e));
    const b = service.stream(undefined, 'user-1').subscribe((e) => second.push(e));

    a.unsubscribe();
    onNotification()('notification:user-1', JSON.stringify({ notificationId: 'n-1' }));
    b.unsubscribe();

    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it('runs a single read loop for all connections', async () => {
    const a = service.stream('ws-1', 'user-1').subscribe();
    const b = service.stream('ws-2', 'user-2').subscribe();
    await flush();

    expect(redis.xread).toHaveBeenCalledTimes(1);
    a.unsubscribe();
    b.unsubscribe();
  });
});
