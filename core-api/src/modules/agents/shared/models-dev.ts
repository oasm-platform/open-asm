import { LLMProvider } from '../enums/agent.enums';

/**
 * Pure helpers for the https://models.dev model catalog: trimming the raw
 * `api.json` down to what the agent needs (limits + cost) and resolving an
 * oasm `(provider, modelId)` pair to a catalog entry. No I/O here.
 */

/** Token limits of a model, as published by models.dev. */
export interface ModelLimits {
  /** Total context window (input + output). */
  context: number;
  /** Max input tokens, when the provider caps input separately. */
  input?: number;
  /** Max output tokens. */
  output?: number;
}

/** Prices in USD per 1M tokens. */
export interface ModelCost {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface CatalogEntry {
  limit: ModelLimits;
  cost?: ModelCost;
  /** models.dev `canonical_model_id`, e.g. `anthropic/claude-sonnet-4-5`. */
  canonical?: string;
}

/** Trimmed catalog: providerKey -> modelId -> entry (keys lowercased). */
export interface TrimmedCatalog {
  version: 1;
  providers: Record<string, Record<string, CatalogEntry>>;
}

export type CatalogMatch = 'exact' | 'canonical' | 'vendor' | 'bare';

export interface CatalogLookupResult {
  entry: CatalogEntry;
  providerKey: string;
  modelId: string;
  matchedBy: CatalogMatch;
  /** True when the match is a guess (bare id across providers). */
  estimated: boolean;
}

/** oasm provider -> models.dev provider keys, tried in order. */
export const PROVIDER_MAP: Record<LLMProvider, string[]> = {
  [LLMProvider.OPENAI]: ['openai'],
  [LLMProvider.ANTHROPIC]: ['anthropic'],
  [LLMProvider.GEMINI]: ['google'],
  [LLMProvider.DEEPSEEK]: ['deepseek'],
  [LLMProvider.OPENROUTER]: ['openrouter'],
  [LLMProvider.VERCEL]: ['vercel'],
  [LLMProvider.KILO_CODE]: ['kilo', 'openrouter'],
  [LLMProvider.OPENCODE_GO]: ['opencode-go', 'opencode'],
  [LLMProvider.CUSTOM]: [],
};

/** Vendor prefixes in `vendor/model` ids that use a different models.dev key. */
const VENDOR_ALIASES: Record<string, string> = {
  gemini: 'google',
};

const MIN_PROVIDERS = 100;
const REQUIRED_PROVIDERS = ['openai', 'anthropic'];

interface RawModel {
  limit?: { context?: unknown; input?: unknown; output?: unknown };
  cost?: {
    input?: unknown;
    output?: unknown;
    cache_read?: unknown;
    cache_write?: unknown;
  };
  canonical_model_id?: unknown;
}

const positiveInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0
    ? Math.floor(v)
    : undefined;

const price = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

function trimModel(raw: RawModel): CatalogEntry | null {
  const context = positiveInt(raw?.limit?.context);
  if (!context) return null;

  const limit: ModelLimits = { context };
  const input = positiveInt(raw.limit?.input);
  const output = positiveInt(raw.limit?.output);
  if (input) limit.input = input;
  if (output) limit.output = output;

  const entry: CatalogEntry = { limit };

  const costIn = price(raw.cost?.input);
  const costOut = price(raw.cost?.output);
  if (costIn !== undefined && costOut !== undefined) {
    const cost: ModelCost = { input: costIn, output: costOut };
    const cacheRead = price(raw.cost?.cache_read);
    const cacheWrite = price(raw.cost?.cache_write);
    if (cacheRead !== undefined) cost.cacheRead = cacheRead;
    if (cacheWrite !== undefined) cost.cacheWrite = cacheWrite;
    entry.cost = cost;
  }

  if (typeof raw.canonical_model_id === 'string' && raw.canonical_model_id) {
    entry.canonical = raw.canonical_model_id.toLowerCase();
  }

  return entry;
}

/**
 * Trims a raw models.dev `api.json` payload to limits + cost.
 *
 * @param raw - Parsed `api.json`.
 * @param onlyProviders - Keep only these provider keys (used for the bundled snapshot).
 * @throws When the payload does not look like a full catalog.
 */
export function trimCatalog(
  raw: unknown,
  onlyProviders?: string[],
): TrimmedCatalog {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('models.dev catalog: payload is not an object');
  }
  const rawProviders = raw as Record<string, { models?: unknown }>;
  const keys = Object.keys(rawProviders);
  if (keys.length < MIN_PROVIDERS) {
    throw new Error(
      `models.dev catalog: expected at least ${MIN_PROVIDERS} providers, got ${keys.length}`,
    );
  }
  for (const required of REQUIRED_PROVIDERS) {
    if (!rawProviders[required]) {
      throw new Error(`models.dev catalog: missing provider "${required}"`);
    }
  }

  const keep = onlyProviders ? new Set(onlyProviders) : null;
  const providers: TrimmedCatalog['providers'] = {};

  for (const [providerKey, provider] of Object.entries(rawProviders)) {
    const key = providerKey.toLowerCase();
    if (keep && !keep.has(key)) continue;
    const models = provider?.models;
    if (!models || typeof models !== 'object') continue;

    const trimmed: Record<string, CatalogEntry> = {};
    for (const [modelId, model] of Object.entries(
      models as Record<string, RawModel>,
    )) {
      const entry = trimModel(model);
      if (entry) trimmed[modelId.toLowerCase()] = entry;
    }
    if (Object.keys(trimmed).length > 0) providers[key] = trimmed;
  }

  return { version: 1, providers };
}

/** All models.dev provider keys referenced by {@link PROVIDER_MAP}. */
export const mappedProviderKeys = (): string[] => [
  ...new Set(Object.values(PROVIDER_MAP).flat()),
];

/**
 * Id variants to try, most specific first: as-is, without `models/` prefix,
 * without `:variant` suffix, without date / `-latest` suffix, and with
 * version dots and dashes swapped (`4.5` <-> `4-5`).
 */
export function candidateIds(modelId: string): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    if (id && !out.includes(id)) out.push(id);
  };

  let id = modelId.trim().toLowerCase();
  add(id);
  id = id.replace(/^models\//, '');
  add(id);
  id = id.replace(/:[a-z0-9-]+$/, '');
  add(id);
  id = id
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/[-@]\d{8}$/, '')
    .replace(/-latest$/, '');
  add(id);

  for (const base of [...out]) {
    add(base.replace(/(\d)\.(\d)/g, '$1-$2'));
    add(base.replace(/(\d)-(\d)(?!\d)/g, '$1.$2'));
  }
  return out;
}

/** In-memory index over a {@link TrimmedCatalog} for fast lookups. */
export class ModelsCatalogIndex {
  private readonly canonicalIndex = new Map<string, CatalogLookupResult>();
  private readonly bareIndex = new Map<string, CatalogLookupResult>();

  constructor(private readonly catalog: TrimmedCatalog) {
    for (const [providerKey, models] of Object.entries(catalog.providers)) {
      for (const [modelId, entry] of Object.entries(models)) {
        const base = { entry, providerKey, modelId };
        if (entry.canonical) {
          this.keepSmallest(this.canonicalIndex, entry.canonical, {
            ...base,
            matchedBy: 'canonical',
            estimated: false,
          });
        }
        const bare = { ...base, matchedBy: 'bare' as const, estimated: true };
        this.keepSmallest(this.bareIndex, modelId, bare);
        const slash = modelId.lastIndexOf('/');
        if (slash >= 0) {
          this.keepSmallest(this.bareIndex, modelId.slice(slash + 1), bare);
        }
      }
    }
  }

  get providerCount(): number {
    return Object.keys(this.catalog.providers).length;
  }

  /**
   * Resolves an oasm provider + model id to a catalog entry.
   *
   * Tiers (first hit wins): mapped provider keys x id variants, canonical id,
   * `vendor/model` split, then the bare id across all providers (smallest
   * context wins, marked estimated). CUSTOM skips the first tier.
   */
  lookup(
    provider: LLMProvider | string,
    modelId: string,
  ): CatalogLookupResult | null {
    if (!modelId) return null;
    const ids = candidateIds(modelId);
    const keys = PROVIDER_MAP[provider as LLMProvider] ?? [];

    for (const key of keys) {
      const hit = this.find(key, ids, 'exact');
      if (hit) return hit;
    }

    for (const id of ids) {
      const hit = this.canonicalIndex.get(id);
      if (hit) return hit;
    }

    for (const id of ids) {
      const slash = id.indexOf('/');
      if (slash <= 0) continue;
      const vendor = id.slice(0, slash);
      const hit = this.find(
        VENDOR_ALIASES[vendor] ?? vendor,
        candidateIds(id.slice(slash + 1)),
        'vendor',
      );
      if (hit) return hit;
    }

    for (const id of ids) {
      const hit =
        this.bareIndex.get(id) ??
        this.bareIndex.get(id.slice(id.lastIndexOf('/') + 1));
      if (hit) return hit;
    }
    return null;
  }

  private find(
    providerKey: string,
    ids: string[],
    matchedBy: CatalogMatch,
  ): CatalogLookupResult | null {
    const models = this.catalog.providers[providerKey];
    if (!models) return null;
    for (const id of ids) {
      const entry = models[id];
      if (entry) {
        return { entry, providerKey, modelId: id, matchedBy, estimated: false };
      }
    }
    return null;
  }

  private keepSmallest(
    index: Map<string, CatalogLookupResult>,
    key: string,
    candidate: CatalogLookupResult,
  ): void {
    const current = index.get(key);
    if (!current || candidate.entry.limit.context < current.entry.limit.context) {
      index.set(key, candidate);
    }
  }
}
