import type { ProviderModelDto } from '../dto/llm-config.dto';
import { resolveOrcaRouterOrigins } from './orcarouter.constants';

/**
 * Live model discovery for OrcaRouter. The catalog returned by the gateway is
 * authoritative; the verified seed is used only when discovery is unavailable
 * or returns nothing usable, and is never merged into a live response.
 */
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;
const MAX_ITEMS = 500;

/** Wire formats this client can actually speak. */
const CHAT_TYPES = new Set(['openai', 'anthropic', 'gemini', 'openai-response']);
/** Non-text routes that must never appear in a chat selector. */
const NON_TEXT_TYPES = new Set([
  'image-generation',
  'openai-video',
  'jina-rerank',
  'embeddings',
]);

const seed = (
  id: string,
  name: string,
  extra: Partial<ProviderModelDto> = {},
): ProviderModelDto => ({ id, name, isFallback: true, ...extra });

/** Small verified dataset for outages; never presented as a live catalog. */
export const ORCAROUTER_VERIFIED_SEED: ProviderModelDto[] = [
  seed('orcarouter/auto', 'OrcaRouter Auto', {
    contextLength: 200_000,
    inputModalities: ['text', 'image'],
    reasoningEfforts: ['low', 'medium', 'high'],
  }),
  seed('orca/orcacyber-ultra-1.0', 'OrcaCyber Ultra', {
    contextLength: 1_048_576,
    inputModalities: ['text'],
  }),
  seed('orca/orcacyber-zero-1.5', 'OrcaCyber Zero', {
    contextLength: 1_000_000,
    inputModalities: ['text'],
  }),
  seed('orca/orcacyber-zero-1.0', 'OrcaCyber Zero 1.0', {
    contextLength: 1_000_000,
    inputModalities: ['text'],
  }),
  seed('orcarouter/fusion', 'OrcaRouter Fusion', {
    contextLength: 1_000_000,
    inputModalities: ['text'],
  }),
  seed('openai/gpt-5.5', 'GPT-5.5', {
    contextLength: 400_000,
    inputModalities: ['text', 'image'],
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  }),
];

/** Selector order: default routing, cyber tiers, general fallback, rest. */
const PREFERRED = [
  'orcarouter/auto',
  'orca/orcacyber-ultra-1.0',
  'orca/orcacyber-zero-1.5',
  'orca/orcacyber-zero-1.0',
  'orcarouter/fusion',
];
const RANK = new Map(PREFERRED.map((id, index) => [id, index]));
const rank = (id: string): number => RANK.get(id) ?? PREFERRED.length;

interface CatalogModel {
  id: string;
  name?: string;
  supported_endpoint_types?: string[];
  architecture?: { input_modalities?: string[] };
  context_length?: number;
}

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined;

function asCatalogModel(value: unknown): CatalogModel | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : undefined,
    supported_endpoint_types: strings(record.supported_endpoint_types),
    architecture: {
      input_modalities: strings(
        (record.architecture as { input_modalities?: unknown })
          ?.input_modalities,
      ),
    },
    context_length:
      typeof record.context_length === 'number'
        ? record.context_length
        : undefined,
  };
}

/** Chat-capable only when the catalog says so; never guessed from the name. */
export function isChatCapableModel(model: CatalogModel): boolean {
  const types = (model.supported_endpoint_types ?? []).map((type) =>
    type.toLowerCase(),
  );
  return (
    types.length > 0 &&
    !types.some((type) => NON_TEXT_TYPES.has(type)) &&
    types.some((type) => CHAT_TYPES.has(type))
  );
}

export function parseOrcaRouterCatalog(body: unknown): ProviderModelDto[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  return data
    .slice(0, MAX_ITEMS)
    .map(asCatalogModel)
    .filter(
      (model): model is CatalogModel => !!model && isChatCapableModel(model),
    )
    .filter((model) => {
      const id = model.id.trim();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((model) => {
      const id = model.id.trim();
      const modalities = model.architecture?.input_modalities;
      return {
        id,
        name: model.name?.trim() || id,
        ...(model.context_length ? { contextLength: model.context_length } : {}),
        ...(modalities ? { inputModalities: modalities } : {}),
      };
    })
    .sort(
      (a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name),
    );
}

/** Fetches the workspace's real model list from the configured API origin. */
export async function fetchOrcaRouterModels(
  apiKey: string,
): Promise<ProviderModelDto[]> {
  if (!apiKey || apiKey === 'not_set') return ORCAROUTER_VERIFIED_SEED;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${resolveOrcaRouterOrigins().apiBaseUrl}/models?capability=chat`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      redirect: 'manual',
    });
    // A rejected key must not be masked by the offline seed: an empty list is
    // what tells the caller the credential is unusable.
    if (response.status === 401 || response.status === 403) return [];
    if (!response.ok) return ORCAROUTER_VERIFIED_SEED;
    const text = await response.text();
    if (text.length > MAX_BYTES) return ORCAROUTER_VERIFIED_SEED;
    const models = parseOrcaRouterCatalog(JSON.parse(text) as unknown);
    return models.length ? models : ORCAROUTER_VERIFIED_SEED;
  } catch {
    return ORCAROUTER_VERIFIED_SEED;
  } finally {
    clearTimeout(timeout);
  }
}
