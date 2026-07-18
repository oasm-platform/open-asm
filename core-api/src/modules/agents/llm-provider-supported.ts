import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { ProviderModelDto } from './dto/llm-config.dto';
import { LLMProvider } from './enums/agent.enums';

export type LLMHandler = (
  apiKey: string,
  model: string,
  baseURL?: string,
) => LanguageModel;

export type LLMModelsFetcher = (
  apiKey: string,
  baseURL?: string,
) => Promise<ProviderModelDto[]>;

export interface LLMProviderSupported {
  id: LLMProvider;
  name: string;
  logo: string;
  handler: LLMHandler;
  fetchModels: LLMModelsFetcher;
  isAcceptCustomApiUrl?: boolean;
}

// --- Helpers ---

const sorted = (models: ProviderModelDto[]) =>
  models.sort((a, b) => a.name.localeCompare(b.name));

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// --- Model fetchers ---

const fetchOpenAIModels: LLMModelsFetcher = async (apiKey) => {
  const json = await fetchJson<{ data: Array<{ id: string }> }>(
    'https://api.openai.com/v1/models',
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  return json
    ? sorted(
        json.data
          .filter((m) => /^(gpt-|o[134])/.test(m.id))
          .map((m) => ({ id: m.id, name: m.id })),
      )
    : [];
};

const fetchOpenRouterModels: LLMModelsFetcher = async () => {
  const json = await fetchJson<{
    data: Array<{ id: string; name?: string; supported_parameters?: string[] }>;
  }>('https://openrouter.ai/api/v1/models');
  return json
    ? sorted(
        json.data
          .filter((m) => m.supported_parameters?.includes('tools'))
          .map((m) => ({ id: m.id, name: m.name ?? m.id })),
      )
    : [];
};

const fetchGeminiModels: LLMModelsFetcher = async (apiKey) => {
  const json = await fetchJson<{
    models: Array<{ name: string; displayName?: string }>;
  }>(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  return json
    ? sorted(
        json.models
          .filter((m) => m.name.startsWith('models/gemini'))
          .map((m) => {
            const id = m.name.replace('models/', '');
            return { id, name: m.displayName ?? id };
          }),
      )
    : [];
};

const fetchKiloGatewayModels: LLMModelsFetcher = async (apiKey) => {
  const json = await fetchJson<{ data: Array<{ id: string; name?: string }> }>(
    'https://api.kilo.ai/api/gateway/models',
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  return json
    ? sorted(json.data.map((m) => ({ id: m.id, name: m.name ?? m.id })))
    : [];
};

const fetchDeepSeekModels: LLMModelsFetcher = async (apiKey) => {
  const json = await fetchJson<{ data: Array<{ id: string }> }>(
    'https://api.deepseek.com/models',
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  return json ? sorted(json.data.map((m) => ({ id: m.id, name: m.id }))) : [];
};

const fetchAnthropicModels: LLMModelsFetcher = () =>
  Promise.resolve([
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  ]);

const fetchVercelModels: LLMModelsFetcher = async (apiKey) => {
  const json = await fetchJson<{ data: Array<{ id: string; name?: string }> }>(
    'https://ai-gateway.vercel.sh/v/models',
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  return json
    ? sorted(json.data.map((m) => ({ id: m.id, name: m.name ?? m.id })))
    : [];
};

const fetchOpenCodeGoModels: LLMModelsFetcher = async (apiKey) => {
  const json = await fetchJson<{
    data: Array<{ id: string; name?: string }>;
  }>('https://opencode.ai/zen/go/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return json
    ? sorted(json.data.map((m) => ({ id: m.id, name: m.name ?? m.id })))
    : [];
};

const fetchCustomProviderModels: LLMModelsFetcher = async (apiKey, baseURL) => {
  if (!baseURL) return [];
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey !== 'not_set') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const json = await fetchJson<{ data: Array<{ id: string; name?: string }> }>(
    `${baseURL.replace(/\/$/, '')}/models`,
    { headers },
  );
  return json
    ? sorted(json.data.map((m) => ({ id: m.id, name: m.name ?? m.id })))
    : [];
};

// --- Provider registry ---

export const llmProviderSupported: LLMProviderSupported[] = [
  {
    id: LLMProvider.OPENROUTER,
    name: 'Open Router',
    logo: '/static/images/openrouter.svg',
    handler: (apiKey, model) =>
      createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' }).chat(
        model,
      ),
    fetchModels: fetchOpenRouterModels,
  },
  {
    id: LLMProvider.OPENAI,
    name: 'OpenAI',
    logo: '/static/images/openai.svg',
    handler: (apiKey, model) => createOpenAI({ apiKey }).chat(model),
    fetchModels: fetchOpenAIModels,
  },
  {
    id: LLMProvider.DEEPSEEK,
    name: 'DeepSeek',
    logo: '/static/images/deepseek.svg',
    handler: (apiKey, model) =>
      createOpenAI({ apiKey, baseURL: 'https://api.deepseek.com' }).chat(model),
    fetchModels: fetchDeepSeekModels,
  },
  {
    id: LLMProvider.GEMINI,
    name: 'Google Gemini',
    logo: '/static/images/gemini.svg',
    handler: (apiKey, model) =>
      createGoogleGenerativeAI({ apiKey }).chat(model),
    fetchModels: fetchGeminiModels,
  },
  {
    id: LLMProvider.KILO_CODE,
    name: 'Kilo Gateway',
    logo: '/static/images/kilocode.svg',
    handler: (apiKey, model) =>
      createOpenAI({ apiKey, baseURL: 'https://api.kilo.ai/api/gateway' }).chat(
        model,
      ),
    fetchModels: fetchKiloGatewayModels,
  },
  {
    id: LLMProvider.OPENCODE_GO,
    name: 'OpenCode Go',
    logo: '/static/images/opencode.svg',
    handler: (apiKey, model) =>
      createOpenAI({ apiKey, baseURL: 'https://opencode.ai/zen/go/v1' }).chat(
        model,
      ),
    fetchModels: fetchOpenCodeGoModels,
  },
  {
    id: LLMProvider.ANTHROPIC,
    name: 'Anthropic',
    logo: '/static/images/anthropic.svg',
    handler: (apiKey, model) => createAnthropic({ apiKey }).chat(model),
    fetchModels: fetchAnthropicModels,
  },
  {
    id: LLMProvider.VERCEL,
    name: 'Vercel AI Gateway',
    logo: '/static/images/vercel.svg',
    handler: (apiKey, model) =>
      createOpenAI({ apiKey, baseURL: 'https://ai-gateway.vercel.sh/v' }).chat(
        model,
      ),
    fetchModels: fetchVercelModels,
  },
  {
    id: LLMProvider.CUSTOM,
    name: 'Custom provider (OpenAI-compatible)',
    logo: '/static/images/llm.svg',
    handler: (apiKey, model, baseURL) =>
      createOpenAI({
        apiKey: !apiKey || apiKey === 'not_set' ? 'not_required' : apiKey,
        baseURL,
      }).chat(model),
    fetchModels: fetchCustomProviderModels,
    isAcceptCustomApiUrl: true,
  },
];

export const getLLMProviderConfig = (
  provider: LLMProvider,
): LLMProviderSupported | undefined =>
  llmProviderSupported.find((p) => p.id === provider);

// --- Reasoning / thinking options per provider ---

const REASONING_OPTIONS: Partial<Record<LLMProvider, Record<string, any>>> = {
   
  [LLMProvider.ANTHROPIC]: {
    anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
  },
  [LLMProvider.OPENAI]: {
    openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
  },
  [LLMProvider.OPENROUTER]: {
    openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
  },
  [LLMProvider.DEEPSEEK]: {
    openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
  },
  [LLMProvider.KILO_CODE]: {
    openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
  },
  [LLMProvider.OPENCODE_GO]: {
    openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
  },
  [LLMProvider.VERCEL]: {
    openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
  },
  [LLMProvider.GEMINI]: {
    google: {
      thinkingConfig: { thinkingBudget: 10000, includeThoughts: true },
    },
  },
};

/**
 * Returns provider-specific reasoning/thinking options for streamText.
 * Each provider has its own configuration format — the AI SDK normalizes
 * the output into a consistent `reasoning` part type on the stream.
 */
export const getReasoningProviderOptions = (
  provider: LLMProvider,
): Record<string, any> | undefined => REASONING_OPTIONS[provider]; // eslint-disable-line @typescript-eslint/no-explicit-any
