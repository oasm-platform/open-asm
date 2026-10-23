/* eslint-disable @typescript-eslint/require-await */
import {
  isUnauthorizedError,
  OrcaRouterCredentialService,
} from './orcarouter-credential.service';
import type { OrcaRouterPkceService } from './orcarouter-pkce.service';

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

const build = () => {
  const redis = new FakeRedis();
  const pkce = {
    complete: jest.fn(async () => ({ apiKey: 'sk-orca-from-pkce', scope: 'api' })),
  } as unknown as OrcaRouterPkceService;
  return { redis, service: new OrcaRouterCredentialService(redis as never, pkce) };
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
  it('marks the current generation and ignores a late report from an old key', async () => {
    const { service } = build();
    await service.recordCredential('cfg-1', 'sk-orca-old');
    await service.recordCredential('cfg-1', 'sk-orca-new');

    await expect(service.reportUnauthorized('cfg-1', 'sk-orca-old')).resolves.toBe(false);
    await expect(service.isNeedsReauth('cfg-1')).resolves.toBe(false);

    await expect(service.reportUnauthorized('cfg-1', 'sk-orca-new')).resolves.toBe(true);
    await expect(service.isNeedsReauth('cfg-1')).resolves.toBe(true);
    // Recording a replacement credential clears the marker.
    await service.recordCredential('cfg-1', 'sk-orca-newer');
    await expect(service.isNeedsReauth('cfg-1')).resolves.toBe(false);
  });

  it('never stores the key itself', async () => {
    const { redis, service } = build();
    await service.recordCredential('cfg-1', 'sk-orca-secret-value');
    expect([...redis.store.values()].join(' ')).not.toContain('sk-orca-secret-value');
  });
});

describe('isUnauthorizedError', () => {
  it('detects 401 from fetch/AI-SDK errors, including a nested cause', () => {
    expect(isUnauthorizedError({ statusCode: 401 })).toBe(true);
    expect(isUnauthorizedError({ status: 401 })).toBe(true);
    expect(isUnauthorizedError({ cause: { statusCode: 401 } })).toBe(true);
    expect(isUnauthorizedError(new Error('401 Unauthorized'))).toBe(true);
    expect(isUnauthorizedError({ statusCode: 429 })).toBe(false);
    expect(isUnauthorizedError(new Error('fetch failed'))).toBe(false);
    expect(isUnauthorizedError(null)).toBe(false);
  });
});
