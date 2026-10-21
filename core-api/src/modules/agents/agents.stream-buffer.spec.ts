/* eslint-disable @typescript-eslint/require-await */
import type { RedisService } from '@/services/redis/redis.service';
import { AgentsStreamBufferService } from './agents.stream-buffer';

/** Minimal in-memory stand-in for the one Redis stream + channel we use. */
class FakeRedis {
  entries: { id: string; fields: Record<string, string> }[] = [];
  private seq = 0;
  private subs = new Map<string, Set<(ch: string, msg: string) => void>>();

  del = jest.fn(async () => {
    this.entries = [];
    return 1;
  });

  xadd = jest.fn(async (_key: string, fields: Record<string, string>) => {
    const id = `${++this.seq}-0`;
    this.entries.push({ id, fields });
    return id;
  });

  publish = jest.fn(async (channel: string, message: string) => {
    const set = this.subs.get(channel);
    if (set) for (const cb of [...set]) cb(channel, message);
    return set?.size ?? 0;
  });

  expire = jest.fn(async () => true);

  xlast = jest.fn(async () => {
    const last = this.entries.at(-1);
    return last ? { id: last.id, fields: { ...last.fields } } : null;
  });

  xrange = jest.fn(async () =>
    this.entries.map((e) => ({ id: e.id, fields: { ...e.fields } })),
  );

  subscribe = jest.fn(async (channel: string, cb: (c: string, m: string) => void) => {
    if (!this.subs.has(channel)) this.subs.set(channel, new Set());
    this.subs.get(channel)!.add(cb);
  });

  unsubscribe = jest.fn(
    async (channel: string, cb?: (c: string, m: string) => void) => {
      if (cb) this.subs.get(channel)?.delete(cb);
      else this.subs.delete(channel);
    },
  );

  hasSubscribers(channel: string): boolean {
    return (this.subs.get(channel)?.size ?? 0) > 0;
  }
}

function build() {
  const redis = new FakeRedis();
  const service = new AgentsStreamBufferService(
    redis as unknown as RedisService,
  );
  return { redis, service };
}

const tick = () => new Promise((r) => setImmediate(r));

describe('AgentsStreamBufferService', () => {
  afterEach(() => jest.useRealTimers());

  it('appends a chunk and publishes it to live resumers', async () => {
    const { redis, service } = build();

    await service.append('c1', '{"type":"text","text":"hi"}');

    expect(redis.xadd).toHaveBeenCalledWith(
      'agent:stream:c1',
      { chunk: '{"type":"text","text":"hi"}' },
      expect.objectContaining({ maxLen: expect.any(Number) }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'agent:stream:chan:c1',
      expect.stringContaining('"chunk"'),
    );
  });

  it('marks the stream done and shortens its TTL', async () => {
    const { redis, service } = build();

    await service.finish('c1');

    expect(redis.xadd).toHaveBeenCalledWith(
      'agent:stream:c1',
      { done: '1' },
      expect.any(Object),
    );
    expect(redis.expire).toHaveBeenCalledWith('agent:stream:c1', 120);
  });

  it('resets by deleting the buffer key', async () => {
    const { redis, service } = build();
    await service.reset('c1');
    expect(redis.del).toHaveBeenCalledWith('agent:stream:c1');
  });

  it('has nothing to resume with no buffer and no active run', async () => {
    const { service } = build();
    const stream = await service.createResumeStream('c1', () => false);
    expect(stream).toBeNull();
  });

  it('has nothing to resume once the run finished', async () => {
    // The database holds the whole answer; replaying it would make the client
    // append it again onto its own copy.
    const { service } = build();
    await service.append('c1', '{"n":1}');
    await service.append('c1', '{"n":2}');
    await service.finish('c1');

    expect(await service.createResumeStream('c1', () => false)).toBeNull();
  });

  it('replays the buffered chunks of a run still producing them', async () => {
    const { service } = build();
    await service.append('c1', '{"n":1}');
    await service.append('c1', '{"n":2}');

    const stream = await service.createResumeStream('c1', () => true);
    const reader = stream!.getReader();
    expect((await reader.read()).value).toBe('{"n":1}');
    expect((await reader.read()).value).toBe('{"n":2}');

    await service.finish('c1');
    await tick();
    expect((await reader.read()).done).toBe(true);
  });

  it('replays the backlog, tails a live chunk, de-duplicates, then closes', async () => {
    const { redis, service } = build();
    await service.append('c1', '{"n":1}'); // backlog

    const stream = await service.createResumeStream('c1', () => true);
    const reader = stream!.getReader();

    // Backlog replayed first
    expect((await reader.read()).value).toBe('{"n":1}');

    // A live chunk arrives over pub/sub and is delivered
    await service.append('c1', '{"n":2}');
    await tick();
    expect((await reader.read()).value).toBe('{"n":2}');

    // The run ends: the done marker closes the stream and unsubscribes
    await service.finish('c1');
    await tick();
    expect((await reader.read()).done).toBe(true);
    expect(redis.hasSubscribers('agent:stream:chan:c1')).toBe(false);
  });

  it('passes a live-only chunk to resumers without recording it', async () => {
    const { redis, service } = build();
    await service.append('c1', '{"n":1}');

    const stream = await service.createResumeStream('c1', () => true);
    const reader = stream!.getReader();
    expect((await reader.read()).value).toBe('{"n":1}');

    await service.publishLive('c1', '{"type":"data-browser-screenshot"}');
    await service.append('c1', '{"n":2}');
    await tick();
    expect((await reader.read()).value).toBe(
      '{"type":"data-browser-screenshot"}',
    );
    expect((await reader.read()).value).toBe('{"n":2}');

    // Never replayed to a later resumer
    expect(redis.entries.map((e) => e.fields.chunk)).toEqual([
      '{"n":1}',
      '{"n":2}',
    ]);
    await reader.cancel();
  });

  it('keeps tailing for one resumer when another of the run leaves', async () => {
    // The client that left (a closed tab, or the one that switched away and
    // came back) must not cut the live chunks of the one still reading
    const { redis, service } = build();
    await service.append('c1', '{"n":1}');

    const left = await service.createResumeStream('c1', () => true);
    const stays = await service.createResumeStream('c1', () => true);
    const leftReader = left!.getReader();
    const reader = stays!.getReader();
    expect((await leftReader.read()).value).toBe('{"n":1}');
    expect((await reader.read()).value).toBe('{"n":1}');

    await leftReader.cancel();
    await service.append('c1', '{"n":2}');
    await tick();
    expect((await reader.read()).value).toBe('{"n":2}');

    await service.finish('c1');
    await tick();
    expect((await reader.read()).done).toBe(true);
    expect(redis.hasSubscribers('agent:stream:chan:c1')).toBe(false);
  });

  it('drops a resume whose run vanished without a done marker', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask'] });
    const { service } = build();
    await service.append('c1', '{"n":1}');

    let active = true;
    const stream = await service.createResumeStream('c1', () => active);
    const reader = stream!.getReader();
    // Force `start` past the backlog, so the idle interval is registered.
    expect((await reader.read()).value).toBe('{"n":1}');

    // Run disappears; the idle check closes the stream on its next pass.
    active = false;
    jest.advanceTimersByTime(10_000);
    await tick();
    expect((await reader.read()).done).toBe(true);
  });
});
