import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LLMProvider } from '../enums/agent.enums';
import {
  candidateIds,
  mappedProviderKeys,
  ModelsCatalogIndex,
  trimCatalog,
  type TrimmedCatalog,
} from './models-dev';

/** Builds a raw api.json-like payload with filler providers to pass validation. */
function rawCatalog(
  providers: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (let i = 0; i < 100; i++) raw[`filler-${i}`] = { models: {} };
  for (const [key, models] of Object.entries(providers)) {
    raw[key] = { id: key, models };
  }
  return raw;
}

const model = (
  context: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  limit: { context, output: 8_000 },
  cost: { input: 1, output: 2 },
  ...extra,
});

describe('trimCatalog', () => {
  it('rejects non-object payloads and catalogs that are too small', () => {
    expect(() => trimCatalog(null)).toThrow('not an object');
    expect(() => trimCatalog([])).toThrow('not an object');
    expect(() =>
      trimCatalog({ openai: { models: {} }, anthropic: { models: {} } }),
    ).toThrow('at least 100 providers');
  });

  it('rejects catalogs missing a required provider', () => {
    expect(() => trimCatalog(rawCatalog({ openai: {} }))).toThrow(
      'missing provider "anthropic"',
    );
  });

  it('keeps limits and cost, lowercases keys and drops unusable entries', () => {
    const catalog = trimCatalog(
      rawCatalog({
        openai: {
          'GPT-5': {
            limit: { context: 400_000, input: 272_000, output: 128_000 },
            cost: { input: 1.25, output: 10, cache_read: 0.125 },
            canonical_model_id: 'OpenAI/GPT-5',
            modalities: { input: ['text'] },
          },
          'no-limit': { cost: { input: 1, output: 1 } },
          'zero-context': { limit: { context: 0, output: 10 } },
        },
        anthropic: { 'claude-x': { limit: { context: 200_000 } } },
      }),
    );

    expect(catalog.providers.openai).toEqual({
      'gpt-5': {
        limit: { context: 400_000, input: 272_000, output: 128_000 },
        cost: { input: 1.25, output: 10, cacheRead: 0.125 },
        canonical: 'openai/gpt-5',
      },
    });
    expect(catalog.providers.anthropic['claude-x']).toEqual({
      limit: { context: 200_000 },
    });
    expect(catalog.providers['filler-0']).toBeUndefined();
  });

  it('keeps only the requested providers', () => {
    const catalog = trimCatalog(
      rawCatalog({
        openai: { a: model(1_000) },
        anthropic: { b: model(2_000) },
        other: { c: model(3_000) },
      }),
      ['openai', 'other'],
    );
    expect(Object.keys(catalog.providers).sort()).toEqual(['openai', 'other']);
  });
});

describe('candidateIds', () => {
  it('strips dated suffixes and swaps version separators', () => {
    expect(candidateIds('claude-sonnet-4-5-20250929')).toEqual(
      expect.arrayContaining(['claude-sonnet-4-5-20250929', 'claude-sonnet-4-5', 'claude-sonnet-4.5']),
    );
    expect(candidateIds('gpt-4o-2024-08-06')).toContain('gpt-4o');
    expect(candidateIds('claude-3-7-sonnet-latest')).toContain('claude-3-7-sonnet');
  });

  it('strips the Gemini models/ prefix and OpenRouter variants', () => {
    expect(candidateIds('models/gemini-2.5-pro')).toEqual(
      expect.arrayContaining(['gemini-2.5-pro', 'gemini-2-5-pro']),
    );
    expect(candidateIds('Meta/Llama-3.3-70B:free')).toEqual(
      expect.arrayContaining(['meta/llama-3.3-70b:free', 'meta/llama-3.3-70b']),
    );
  });

  it('puts the exact lowercased id first and has no duplicates', () => {
    const ids = candidateIds('GPT-5');
    expect(ids[0]).toBe('gpt-5');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ModelsCatalogIndex.lookup', () => {
  const catalog: TrimmedCatalog = {
    version: 1,
    providers: {
      openai: {
        'gpt-5': { limit: { context: 400_000, input: 272_000, output: 128_000 }, canonical: 'openai/gpt-5' },
      },
      anthropic: {
        'claude-sonnet-4-5': { limit: { context: 200_000, output: 64_000 }, canonical: 'anthropic/claude-sonnet-4-5' },
      },
      google: { 'gemini-2.5-pro': { limit: { context: 1_048_576, output: 65_536 } } },
      openrouter: {
        'anthropic/claude-sonnet-4.5': { limit: { context: 1_000_000, output: 64_000 }, canonical: 'anthropic/claude-sonnet-4-5' },
      },
      kilo: {},
      'some-host': { 'qwen3-coder': { limit: { context: 262_144 } } },
      'other-host': { 'qwen3-coder': { limit: { context: 131_072 } } },
    },
  };
  const index = new ModelsCatalogIndex(catalog);

  it('matches exact ids under the mapped provider key', () => {
    expect(index.lookup(LLMProvider.OPENAI, 'gpt-5')).toMatchObject({
      providerKey: 'openai',
      matchedBy: 'exact',
      estimated: false,
      entry: { limit: { context: 400_000, input: 272_000 } },
    });
  });

  it('maps gemini to the google key and strips models/', () => {
    expect(index.lookup(LLMProvider.GEMINI, 'models/gemini-2.5-pro')).toMatchObject({
      providerKey: 'google',
      matchedBy: 'exact',
    });
  });

  it('resolves dated Anthropic ids', () => {
    expect(index.lookup(LLMProvider.ANTHROPIC, 'claude-sonnet-4-5-20250929')).toMatchObject({
      providerKey: 'anthropic',
      modelId: 'claude-sonnet-4-5',
    });
  });

  it('prefers the provider-specific entry over the canonical one', () => {
    expect(
      index.lookup(LLMProvider.OPENROUTER, 'anthropic/claude-sonnet-4.5')?.entry.limit.context,
    ).toBe(1_000_000);
  });

  it('falls back from kilo to openrouter', () => {
    expect(index.lookup(LLMProvider.KILO_CODE, 'anthropic/claude-sonnet-4.5')).toMatchObject({
      providerKey: 'openrouter',
      matchedBy: 'exact',
    });
  });

  it('uses the canonical index, picking the smallest context', () => {
    expect(index.lookup(LLMProvider.VERCEL, 'anthropic/claude-sonnet-4.5')).toMatchObject({
      matchedBy: 'canonical',
      entry: { limit: { context: 200_000 } },
    });
  });

  it('splits vendor/model ids and aliases gemini to google', () => {
    expect(index.lookup(LLMProvider.VERCEL, 'gemini/gemini-2.5-pro')).toMatchObject({
      providerKey: 'google',
      matchedBy: 'vendor',
    });
  });

  it('matches bare ids across providers for CUSTOM, smallest context, estimated', () => {
    expect(index.lookup(LLMProvider.CUSTOM, 'gpt-5')).toMatchObject({
      providerKey: 'openai',
      matchedBy: 'bare',
      estimated: true,
    });
    expect(index.lookup(LLMProvider.CUSTOM, 'qwen/qwen3-coder')).toMatchObject({
      providerKey: 'other-host',
      matchedBy: 'bare',
      entry: { limit: { context: 131_072 } },
    });
  });

  it('returns null for unknown or empty ids', () => {
    expect(index.lookup(LLMProvider.OPENAI, 'does-not-exist')).toBeNull();
    expect(index.lookup(LLMProvider.OPENAI, '')).toBeNull();
  });
});

describe('bundled snapshot', () => {
  const snapshot = JSON.parse(
    readFileSync(join(__dirname, '../../../../resources/models-dev/catalog.json'), 'utf-8'),
  ) as TrimmedCatalog;

  it('contains every mapped provider key', () => {
    expect(snapshot.version).toBe(1);
    for (const key of mappedProviderKeys()) {
      expect(Object.keys(snapshot.providers[key] ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('resolves well-known models', () => {
    const index = new ModelsCatalogIndex(snapshot);
    expect(index.lookup(LLMProvider.OPENAI, 'gpt-5')?.entry.limit.context).toBeGreaterThan(0);
    expect(index.lookup(LLMProvider.ANTHROPIC, 'claude-sonnet-4-5')?.entry.limit.context).toBeGreaterThan(0);
    expect(index.lookup(LLMProvider.GEMINI, 'gemini-2.5-pro')?.entry.limit.context).toBeGreaterThan(0);
  });
});
