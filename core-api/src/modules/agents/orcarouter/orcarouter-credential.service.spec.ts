/* eslint-disable @typescript-eslint/require-await */
import { Logger } from '@nestjs/common';
import {
  isUnauthorizedError,
  OrcaRouterCredentialService,
} from './orcarouter-credential.service';
import type { OrcaRouterPkceService } from './orcarouter-pkce.service';

class FakeRedisClient {
  readonly sets = new Map<string, Set<string>>();
  fail = false;
  private set(key: string) {
    if (this.fail) throw new Error('redis down');
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    return this.sets.get(key)!;
  }
  async sadd(key: string, member: string) {
    const set = this.set(key);
    const added = set.has(member) ? 0 : 1;
    set.add(member);
    return added;
  }
  async srem(key: string, member: string) {
    return this.set(key).delete(member) ? 1 : 0;
  }
  async sismember(key: string, member: string) {
    return this.set(key).has(member) ? 1 : 0;
  }
  async del(key: string) {
    this.set(key);
    return this.sets.delete(key) ? 1 : 0;
  }
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const build = () => {
  const redis = new FakeRedisClient();
  const pkce = {
    complete: jest.fn(async () => ({ apiKey: 'sk-orca-from-pkce', scope: 'api' })),
  } as unknown as OrcaRouterPkceService;
  return {
    redis,
    service: new OrcaRouterCredentialService({ client: redis } as never, pkce),
  };
};

describe('OrcaRouterCredentialService adapters', () => {
  it('produces the same credential shape from an API key and from PKCE', async () => {
    const { service } = build();
    const fromKey = service.fromApiKey('  sk-orca-pasted  ');
    const fromPkce = await service.fromPkce({
      attemptId: 'attempt',
      code: 'CODE',
      workspaceId: 'ws',
      userId: 'user',
    });

    expect(fromKey).toEqual({ apiKey: 'sk-orca-pasted', scope: 'api', source: 'api_key' });
    expect(fromPkce).toEqual({ apiKey: 'sk-orca-from-pkce', scope: 'api', source: 'pkce' });
    expect(Object.keys(fromKey)).toEqual(Object.keys(fromPkce));
  });

  it('rejects an empty key and a key without the OrcaRouter prefix', () => {
    const { service } = build();
    expect(() => service.fromApiKey('   ')).toThrow(/Paste an OrcaRouter API key/);
    expect(() => service.fromApiKey('sk-live-other')).toThrow(/sk-orca-/);
  });
});

describe('OrcaRouterCredentialService lifecycle', () => {
  it('flags only the rejected key, so a late 401 from an old key never flags its replacement', async () => {
    const { service } = build();
    await service.recordCredential('cfg-1', 'sk-orca-new');

    await expect(service.reportUnauthorized('cfg-1', 'sk-orca-old')).resolves.toBe(true);
    await expect(service.isNeedsReauth('cfg-1', 'sk-orca-new')).resolves.toBe(false);

    await expect(service.reportUnauthorized('cfg-1', 'sk-orca-new')).resolves.toBe(true);
    await expect(service.isNeedsReauth('cfg-1', 'sk-orca-new')).resolves.toBe(true);
    // A repeated report is not a new rejection.
    await expect(service.reportUnauthorized('cfg-1', 'sk-orca-new')).resolves.toBe(false);
    // A replacement key starts clean; saving the same key again trusts it again.
    await expect(service.isNeedsReauth('cfg-1', 'sk-orca-newer')).resolves.toBe(false);
    await service.recordCredential('cfg-1', 'sk-orca-new');
    await expect(service.isNeedsReauth('cfg-1', 'sk-orca-new')).resolves.toBe(false);
  });

  it('keeps the flag until the connection is deleted', async () => {
    const { service } = build();
    await service.reportUnauthorized('cfg-1', 'sk-orca-key');
    await service.forget('cfg-1');
    await expect(service.isNeedsReauth('cfg-1', 'sk-orca-key')).resolves.toBe(false);
  });

  it('never stores the key itself', async () => {
    const { redis, service } = build();
    await service.reportUnauthorized('cfg-1', 'sk-orca-secret-value');
    const stored = [...redis.sets.values()].flatMap((set) => [...set]);
    expect(stored.join(' ')).not.toContain('sk-orca-secret-value');
  });

  it('treats a Redis failure as "not flagged" instead of failing the caller', async () => {
    const { redis, service } = build();
    redis.fail = true;
    await expect(service.recordCredential('cfg-1', 'sk-orca-key')).resolves.toBeUndefined();
    await expect(service.reportUnauthorized('cfg-1', 'sk-orca-key')).resolves.toBe(false);
    await expect(service.isNeedsReauth('cfg-1', 'sk-orca-key')).resolves.toBe(false);
    await expect(service.forget('cfg-1')).resolves.toBeUndefined();
  });
});

describe('isUnauthorizedError', () => {
  it('detects 401 from fetch/AI-SDK errors, including wrapped errors', () => {
    expect(isUnauthorizedError({ statusCode: 401 })).toBe(true);
    expect(isUnauthorizedError({ status: 401 })).toBe(true);
    expect(isUnauthorizedError({ cause: { statusCode: 401 } })).toBe(true);
    expect(isUnauthorizedError({ lastError: { statusCode: 401 } })).toBe(true);
    expect(isUnauthorizedError(new Error('401 Unauthorized'))).toBe(true);
    expect(isUnauthorizedError({ statusCode: 429 })).toBe(false);
    expect(isUnauthorizedError(new Error('fetch failed'))).toBe(false);
    expect(isUnauthorizedError(null)).toBe(false);
  });

  it('lets the status code win over the message', () => {
    // Policy denials and unverified-tier calls are 403s, often worded "Unauthorized".
    expect(
      isUnauthorizedError({ statusCode: 403, message: 'Unauthorized: model requires verification' }),
    ).toBe(false);
    expect(isUnauthorizedError({ cause: { status: 403, message: 'invalid api key' } })).toBe(false);
    expect(isUnauthorizedError(new Error('Unauthorized'))).toBe(false);
  });
});
