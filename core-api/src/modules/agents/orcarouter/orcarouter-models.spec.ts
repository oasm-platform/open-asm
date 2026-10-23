/* eslint-disable @typescript-eslint/require-await */
import {
  fetchOrcaRouterModels,
  isChatCapableModel,
  ORCAROUTER_VERIFIED_SEED,
  parseOrcaRouterCatalog,
} from './orcarouter-models';
import { resolveOrcaRouterOrigins } from './orcarouter.constants';

afterEach(() => jest.restoreAllMocks());
const mockFetch = (impl: () => Response) =>
  (global.fetch = jest.fn(async () => impl()) as unknown as typeof fetch);
const ok = (body: unknown) =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as unknown as Response;

describe('resolveOrcaRouterOrigins', () => {
  it('uses separate public origins and lets explicit overrides win', () => {
    expect(resolveOrcaRouterOrigins({})).toEqual({
      authBaseUrl: 'https://www.orcarouter.ai',
      apiBaseUrl: 'https://api.orcarouter.ai/v1',
    });
    expect(
      resolveOrcaRouterOrigins({
        ORCA_BASE_URL: 'https://orca.example',
        ORCA_AUTH_BASE_URL: 'https://auth.internal.example',
        ORCA_API_BASE_URL: 'https://relay.internal.example/v1',
      }),
    ).toEqual({
      authBaseUrl: 'https://auth.internal.example',
      apiBaseUrl: 'https://relay.internal.example/v1',
    });
  });

  it('uses a shared base, allows HTTP on loopback only and rejects the rest', () => {
    expect(resolveOrcaRouterOrigins({ ORCA_BASE_URL: 'https://orca.example' })).toEqual({
      authBaseUrl: 'https://orca.example',
      apiBaseUrl: 'https://orca.example/v1',
    });
    expect(resolveOrcaRouterOrigins({ ORCA_API_BASE_URL: 'http://127.0.0.1:8080/v1' }).apiBaseUrl)
      .toBe('http://127.0.0.1:8080/v1');
    expect(() => resolveOrcaRouterOrigins({ ORCA_AUTH_BASE_URL: 'http://orca.example' })).toThrow(/HTTPS/);
    expect(() => resolveOrcaRouterOrigins({ ORCA_BASE_URL: 'https://u:p@orca.example' })).toThrow(/credentials/);
  });
});

describe('parseOrcaRouterCatalog', () => {
  it('keeps only models that explicitly speak a chat endpoint type', () => {
    const models = parseOrcaRouterCatalog({
      data: [
        { id: 'openai/gpt-5.5', name: 'GPT-5.5', supported_endpoint_types: ['openai'], context_length: 400000 },
        { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8', supported_endpoint_types: ['anthropic'] },
        { id: 'a/image', supported_endpoint_types: ['image-generation'] },
        { id: 'a/video', supported_endpoint_types: ['openai-video'] },
        { id: 'a/rerank', supported_endpoint_types: ['jina-rerank'] },
        { id: 'a/embed', supported_endpoint_types: ['embeddings'] },
        { id: 'a/no-metadata' },
        { id: '' },
        'not-an-object',
      ],
    });

    expect(models.map((model) => model.id)).toEqual([
      'anthropic/claude-opus-4.8',
      'openai/gpt-5.5',
    ]);
    expect(models[1].contextLength).toBe(400000);
  });

  it('fails closed, deduplicates and rejects non-catalog bodies', () => {
    expect(isChatCapableModel({ id: 'x/y' })).toBe(false);
    expect(
      parseOrcaRouterCatalog({
        data: [
          { id: 'a/one', supported_endpoint_types: ['openai'] },
          { id: 'a/one', supported_endpoint_types: ['openai'] },
        ],
      }),
    ).toHaveLength(1);
    expect(parseOrcaRouterCatalog(null)).toEqual([]);
    expect(parseOrcaRouterCatalog({ data: 'nope' })).toEqual([]);
  });

  it('orders default, cyber and general-fallback tiers ahead of the rest', () => {
    const models = parseOrcaRouterCatalog({
      data: [
        { id: 'other/model', name: 'Alpha', supported_endpoint_types: ['openai'] },
        { id: 'orcarouter/fusion', name: 'Fusion', supported_endpoint_types: ['openai'] },
        { id: 'orca/orcacyber-zero-1.5', name: 'Zero', supported_endpoint_types: ['openai'] },
        { id: 'orcarouter/auto', name: 'Auto', supported_endpoint_types: ['openai'] },
        { id: 'orca/orcacyber-ultra-1.0', name: 'Ultra', supported_endpoint_types: ['openai'] },
      ],
    });
    expect(models.map((model) => model.id)).toEqual([
      'orcarouter/auto',
      'orca/orcacyber-ultra-1.0',
      'orca/orcacyber-zero-1.5',
      'orcarouter/fusion',
      'other/model',
    ]);
  });
});

describe('fetchOrcaRouterModels', () => {
  it('queries the API origin catalog with the user key and is authoritative', async () => {
    const calls: Array<{ url: string; auth?: string }> = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        auth: (init?.headers as Record<string, string>).Authorization,
      });
      return ok({
        data: [
          { id: 'orcarouter/auto', name: 'Auto', supported_endpoint_types: ['openai'] },
        ],
      });
    });

    const models = await fetchOrcaRouterModels('sk-orca-test');
    expect(calls[0]).toEqual({
      url: 'https://api.orcarouter.ai/v1/models?capability=chat',
      auth: 'Bearer sk-orca-test',
    });
    expect(models.map((model) => model.id)).toEqual(['orcarouter/auto']);
    // Live discovery is authoritative: the seed is never merged in.
    expect(models.some((model) => model.isFallback)).toBe(false);
  });

  it('returns an empty list for a rejected key so the connection is not faked', async () => {
    mockFetch(() => ({ ok: false, status: 401 }) as unknown as Response);
    await expect(fetchOrcaRouterModels('sk-orca-revoked')).resolves.toEqual([]);
  });

  it('falls back to the verified seed with metadata on an outage', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });

    const models = await fetchOrcaRouterModels('sk-orca-test');
    expect(models.map((model) => model.id)).toEqual(ORCAROUTER_VERIFIED_SEED.map((model) => model.id));
    expect(models.every((model) => model.isFallback)).toBe(true);
    const gpt = models.find((model) => model.id === 'openai/gpt-5.5');
    expect(gpt?.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(gpt?.inputModalities).toEqual(['text', 'image']);
    expect(models.map((model) => model.name)).toEqual(
      expect.arrayContaining(['OrcaCyber Ultra', 'OrcaCyber Zero']),
    );
  });
});
