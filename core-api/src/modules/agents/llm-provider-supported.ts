import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { ProviderModelDto } from './dto/llm-config.dto';
import { LLMProvider, ReasoningEffort } from './enums/agent.enums';
import type { ModelReasoning } from './shared/models-dev';

export type LLMHandler = (
  apiKey: string,
  model: string,
  baseURL?: string,
) => LanguageModel;

/** A model as a provider lists it; reasoning levels come from models.dev. */
export type FetchedModel = Pick<ProviderModelDto, 'id' | 'name'>;

export type LLMModelsFetcher = (
  apiKey: string,
  baseURL?: string,
) => Promise<FetchedModel[]>;

export interface LLMProviderSupported {
  id: LLMProvider;
  name: string;
  logo: string;
  handler: LLMHandler;
  fetchModels: LLMModelsFetcher;
  isAcceptCustomApiUrl?: boolean;
}

// --- Helpers ---

const sorted = (models: FetchedModel[]) =>
  models.sort((a, b) => a.name.localeCompare(b.name));

const FETCH_TIMEOUT_MS = 10_000;

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      ...init,
      signal: init?.signal
        ? combineAbortSignals(init.signal, controller.signal)
        : controller.signal,
    });
    clearTimeout(timeout);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function combineAbortSignals(
  ...signals: AbortSignal[]
): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
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

const fetchOrcaRouterModels: LLMModelsFetcher = async (apiKey) => {
  const json = await fetchJson<{
    data: Array<{
      id: string;
      name?: string;
      supported_endpoint_types?: string[];
    }>;
  }>('https://api.orcarouter.ai/v1/models?capability=chat', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  // Requests go through OpenAI chat completions, so models served only over
  // another wire format (Anthropic, Gemini, Responses) would always fail
  return json
    ? sorted(
        json.data
          .filter((m) => m.supported_endpoint_types?.includes('openai'))
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

const fetchAnthropicModels: LLMModelsFetcher = async (apiKey) => {
  const json = await fetchJson<{
    data: Array<{ id: string; display_name?: string }>;
  }>('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  return json
    ? sorted(
        json.data
          .filter((m) => m.id.startsWith('claude-'))
          .map((m) => ({ id: m.id, name: m.display_name ?? m.id })),
      )
    : [];
};

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
    data: Array<{ id: string; name?: string; type?: string; transport?: string }>;
  }>('https://opencode.ai/zen/go/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!json) return [];
  // If the API returns transport/type metadata, filter to chat-compatible models.
  // Otherwise return all models (runtime error handling will catch incompatible ones).
  let models = json.data;
  if (models.some((m) => m.transport || m.type)) {
    models = models.filter(
      (m) =>
        (m.transport ?? '').toLowerCase().includes('chat') ||
        (m.transport ?? '').toLowerCase().includes('openai') ||
        !m.transport,
    );
  }
  return sorted(models.map((m) => ({ id: m.id, name: m.name ?? m.id })));
};

/** Known private / loopback / link-local address prefixes. */
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname));
}

const fetchCustomProviderModels: LLMModelsFetcher = async (apiKey, baseURL) => {
  if (!baseURL) return [];

  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    return [];
  }

  // Only allow HTTP(S) schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return [];
  }

  // Block SSRF: reject private, loopback, link-local hosts
  if (isPrivateHost(parsed.hostname)) {
    return [];
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey !== 'not_set') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const json = await fetchJson<{ data: Array<{ id: string; name?: string }> }>(
    `${baseURL.replace(/\/$/, '')}/models`,
    { headers, redirect: 'manual' },
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
    id: LLMProvider.ORCAROUTER,
    name: 'OrcaRouter',
    logo: '/static/images/orcarouter.png',
    handler: (apiKey, model) =>
      createOpenAI({ apiKey, baseURL: 'https://api.orcarouter.ai/v1' }).chat(
        model,
      ),
    fetchModels: fetchOrcaRouterModels,
  },
  {
    id: LLMProvider.OPENAI,
    name: 'OpenAI',
    logo: '/static/images/openai.svg',
    handler: (apiKey, model) => createOpenAI({ apiKey }).responses(model),
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

type AnthropicReasoningOptions = {
  anthropic: {
    thinking:
      | { type: 'enabled'; budgetTokens: number }
      | { type: 'adaptive' };
    effort?: string;
  };
};

type OpenAIReasoningOptions = {
  openai: { reasoningEffort: string; reasoningSummary: string };
};

type GoogleReasoningOptions = {
  google: {
    thinkingConfig:
      | { thinkingBudget: number; includeThoughts: boolean }
      | { thinkingLevel: string; includeThoughts: boolean };
  };
};

export type ProviderReasoningOptions =
  | AnthropicReasoningOptions
  | OpenAIReasoningOptions
  | GoogleReasoningOptions;

// --- Reasoning / thinking options per provider ---

const DEFAULT_THINKING_BUDGET = 10000;

/** Thinking budget per effort, for models tuned by tokens. */
const EFFORT_BUDGET: Record<ReasoningEffort, number> = {
  [ReasoningEffort.NONE]: 0,
  [ReasoningEffort.MINIMAL]: 1024,
  [ReasoningEffort.LOW]: 4096,
  [ReasoningEffort.MEDIUM]: DEFAULT_THINKING_BUDGET,
  [ReasoningEffort.HIGH]: 16000,
  [ReasoningEffort.XHIGH]: 24000,
  [ReasoningEffort.MAX]: 32000,
};

const ANTHROPIC_EFFORTS = new Set<string>([
  ReasoningEffort.LOW,
  ReasoningEffort.MEDIUM,
  ReasoningEffort.HIGH,
  ReasoningEffort.XHIGH,
  ReasoningEffort.MAX,
]);

const GEMINI_LEVELS = new Set<string>([
  ReasoningEffort.MINIMAL,
  ReasoningEffort.LOW,
  ReasoningEffort.MEDIUM,
  ReasoningEffort.HIGH,
]);

const openaiReasoning = (effort: string): OpenAIReasoningOptions => ({
  openai: { reasoningEffort: effort, reasoningSummary: 'auto' },
});

function anthropicReasoning(
  effort: ReasoningEffort | undefined,
  reasoning: ModelReasoning | undefined,
): AnthropicReasoningOptions | undefined {
  if (effort === ReasoningEffort.NONE) return undefined;
  const withEffort =
    effort && reasoning?.efforts?.includes(effort) && ANTHROPIC_EFFORTS.has(effort)
      ? { effort }
      : {};
  // Newer models take no token budget, only adaptive thinking + effort
  if (reasoning?.efforts && !reasoning.budget && 'effort' in withEffort) {
    return { anthropic: { thinking: { type: 'adaptive' }, ...withEffort } };
  }
  return {
    anthropic: {
      thinking: {
        type: 'enabled',
        budgetTokens: effort ? EFFORT_BUDGET[effort] : DEFAULT_THINKING_BUDGET,
      },
      ...withEffort,
    },
  };
}

function geminiReasoning(
  effort: ReasoningEffort | undefined,
  reasoning: ModelReasoning | undefined,
): GoogleReasoningOptions | undefined {
  if (effort === ReasoningEffort.NONE) return undefined;
  if (effort && reasoning?.efforts?.includes(effort) && GEMINI_LEVELS.has(effort)) {
    return {
      google: { thinkingConfig: { thinkingLevel: effort, includeThoughts: true } },
    };
  }
  return {
    google: {
      thinkingConfig: {
        thinkingBudget: effort ? EFFORT_BUDGET[effort] : DEFAULT_THINKING_BUDGET,
        includeThoughts: true,
      },
    },
  };
}

/**
 * Returns provider-specific reasoning/thinking options for streamText.
 * Each provider has its own configuration format — the AI SDK normalizes
 * the output into a consistent `reasoning` part type on the stream.
 *
 * @param effort - Picked level; unset keeps the provider default (high).
 * @param reasoning - The model's reasoning knobs from models.dev, if known.
 */
export const getReasoningProviderOptions = (
  provider: LLMProvider,
  effort?: ReasoningEffort,
  reasoning?: ModelReasoning,
): ProviderReasoningOptions | undefined => {
  switch (provider) {
    case LLMProvider.ANTHROPIC:
      return anthropicReasoning(effort, reasoning);
    case LLMProvider.GEMINI:
      return geminiReasoning(effort, reasoning);
    // Self-hosted models get reasoning options only when a level was picked
    case LLMProvider.CUSTOM:
      return effort ? openaiReasoning(effort) : undefined;
    default:
      return openaiReasoning(effort ?? ReasoningEffort.HIGH);
  }
};
