/* eslint-disable @typescript-eslint/require-await */
import { createHash } from 'node:crypto';
import { OrcaRouterPkceService } from './orcarouter-pkce.service';

class FakeRedis {
  readonly store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async setex(key: string, _ttl: number, value: string) {
    this.store.set(key, value);
  }
  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }
}

const WS = 'workspace-1';
const USER = 'user-1';
const json = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;
const mockFetch = (impl: () => unknown) =>
  (global.fetch = jest.fn(async () => impl()) as unknown as typeof fetch);

const build = () => {
  const redis = new FakeRedis();
  const service = new OrcaRouterPkceService(redis as never);
  const start = () => service.start(WS, USER);
  const complete = (attemptId: string, extra = {}) =>
    service.complete({ attemptId, code: 'CODE', workspaceId: WS, userId: USER, ...extra });
  return { redis, service, start, complete };
};

const savedEnv = { ...process.env };
beforeEach(() => {
  delete process.env.ORCA_AUTH_BASE_URL;
  delete process.env.ORCA_API_BASE_URL;
  delete process.env.ORCA_BASE_URL;
});
afterEach(() => {
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});

describe('OrcaRouterPkceService.start', () => {
  it('builds an S256 out-of-band authorize URL on the auth origin', async () => {
    const { start } = build();
    const { authorizeUrl, expiresAt } = await start();
    const url = new URL(authorizeUrl);
    expect(url.origin).toBe('https://www.orcarouter.ai');
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('callback_url')).toBe('oob');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('api');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('keeps the verifier server-side and mints fresh values per attempt', async () => {
    const { redis, start } = build();
    const first = await start();
    const second = await start();
    const stored = JSON.parse(
      redis.store.get(`orcarouter:pkce:attempt:${first.attemptId}`) ?? '{}',
    ) as { verifier: string };
    expect(first.authorizeUrl).not.toContain(stored.verifier);
    expect(first.attemptId).not.toBe(second.attemptId);
    expect(new URL(first.authorizeUrl).searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(stored.verifier).digest('base64url'),
    );
  });
});

describe('OrcaRouterPkceService.complete', () => {
  it('exchanges the verifier on the auth origin and returns the grant', async () => {
    const { start, complete } = build();
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(init?.body as string) as never });
      return json(200, { key: 'sk-orca-issued', scope: 'api' });
    });

    await expect(complete((await start()).attemptId)).resolves.toEqual({
      apiKey: 'sk-orca-issued',
      scope: 'api',
    });
    expect(calls[0].url).toBe('https://www.orcarouter.ai/api/v1/auth/keys');
    expect(calls[0].url).not.toContain('api.orcarouter.ai');
    expect(calls[0].body).toMatchObject({
      code: 'CODE',
      code_challenge_method: 'S256',
    });
    expect(String(calls[0].body.code_verifier)).toHaveLength(43);
  });

  it('consumes the attempt before exchanging, so a code cannot be replayed', async () => {
    const { start, complete } = build();
    const attemptId = (await start()).attemptId;
    mockFetch(() => json(200, { key: 'sk-orca-issued', scope: 'api' }));
    await complete(attemptId);
    await expect(complete(attemptId)).rejects.toThrow(/expired or was already used/);
  });

  it('rejects another session and a tampered state before any exchange', async () => {
    const { redis, service, start, complete } = build();
    const { attemptId } = await start();
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    await expect(
      service.complete({ attemptId, code: 'CODE', workspaceId: 'other', userId: USER }),
    ).rejects.toThrow(/different session/);
    await expect(complete(attemptId, { state: 'tampered' })).rejects.toThrow(/did not match/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redis.store.size).toBe(0);
  });

  it('refuses a reduced scope instead of assuming the requested one', async () => {
    const { start, complete } = build();
    mockFetch(() => json(200, { key: 'sk-orca-issued', scope: 'connector' }));
    await expect(complete((await start()).attemptId)).rejects.toThrow(/cannot make inference calls/);
  });

  it('maps exchange failures to actionable errors', async () => {
    for (const [status, pattern] of [
      [400, /rejected the code exchange/],
      [403, /unknown, expired or already used/],
    ] as const) {
      const { start, complete } = build();
      mockFetch(() => json(status, { error: 'invalid_grant' }));
      await expect(complete((await start()).attemptId)).rejects.toThrow(pattern);
    }
    const limited = build();
    mockFetch(() => json(429, { error: 'rate_limited' }));
    await expect(limited.complete((await limited.start()).attemptId)).rejects.toMatchObject({ status: 429 });

    const transport = build();
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    await expect(transport.complete((await transport.start()).attemptId)).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a foreign key shape and discards an attempt on cancel', async () => {
    const { redis, service, start, complete } = build();
    mockFetch(() => json(200, { key: 'sk-live-something', scope: 'api' }));
    await expect(complete((await start()).attemptId)).rejects.toThrow(/did not return a usable API key/);
    await service.cancel((await start()).attemptId);
    expect(redis.store.size).toBe(0);
  });
});
