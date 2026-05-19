import { createAnthropic } from '@ai-sdk/anthropic';
import { createCohere } from '@ai-sdk/cohere';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel, EmbeddingModel } from 'ai';
import type { ProviderModelDto } from './dto/llm-config.dto';
import { LLMProvider } from './enums/agent.enums';
import type { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { decrypt } from '@/common/utils/encryption.util';

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

const fetchOpenAIModels = async (
  apiKey: string,
): Promise<ProviderModelDto[]> => {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      data: Array<{ id: string }>;
    };

    return data.data
      .filter(
        (m) =>
          m.id.startsWith('gpt-') ||
          m.id.startsWith('o1') ||
          m.id.startsWith('o3') ||
          m.id.startsWith('o4'),
      )
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
};

const fetchOpenRouterModels = async (): Promise<ProviderModelDto[]> => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        name?: string;
        supported_parameters?: string[];
      }>;
    };

    return data.data
      .filter((m) => m.supported_parameters?.includes('tools'))
      .map((m) => ({ id: m.id, name: m.name ?? m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
};

const fetchGeminiModels = async (
  apiKey: string,
): Promise<ProviderModelDto[]> => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      models: Array<{ name: string; displayName?: string }>;
    };

    return data.models
      .filter((m) => m.name.startsWith('models/gemini'))
      .map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName ?? m.name.replace('models/', ''),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
};

const fetchKiloGatewayModels = async (
  apiKey: string,
): Promise<ProviderModelDto[]> => {
  try {
    const response = await fetch('https://api.kilo.ai/api/gateway/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      data: Array<{ id: string; name?: string }>;
    };

    return data.data
      .map((m) => ({ id: m.id, name: m.name ?? m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
};

const fetchAnthropicModels = (): Promise<ProviderModelDto[]> =>
  Promise.resolve([
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  ]);

const fetchMistralModels = async (
  apiKey: string,
): Promise<ProviderModelDto[]> => {
  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      data: Array<{ id: string; capabilities?: { completion_chat?: boolean } }>;
    };
    return data.data
      .filter((m) => m.capabilities?.completion_chat !== false)
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
};

const fetchCohereModels = (): Promise<ProviderModelDto[]> =>
  Promise.resolve([
    { id: 'command-a-03-2025', name: 'Command A (Mar 2025)' },
    { id: 'command-r-plus', name: 'Command R+' },
    { id: 'command-r', name: 'Command R' },
    { id: 'command-r7b-12-2024', name: 'Command R7B' },
  ]);

const fetchCustomProviderModels = async (
  apiKey: string,
  baseURL?: string,
): Promise<ProviderModelDto[]> => {
  if (!baseURL) return [];
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey && apiKey !== 'not_set') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/models`, {
      headers,
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      data: Array<{ id: string; name?: string }>;
    };
    return data.data
      .map((m) => ({ id: m.id, name: m.name ?? m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
};

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
    id: LLMProvider.ANTHROPIC,
    name: 'Anthropic',
    logo: '/static/images/anthropic.svg',
    handler: (apiKey, model) => createAnthropic({ apiKey }).chat(model),
    fetchModels: fetchAnthropicModels,
  },
  {
    id: LLMProvider.MISTRAL,
    name: 'Mistral',
    logo: '/static/images/mistral.svg',
    handler: (apiKey, model) => createMistral({ apiKey }).chat(model),
    fetchModels: fetchMistralModels,
  },
  {
    id: LLMProvider.COHERE,
    name: 'Cohere',
    logo: '/static/images/cohere.svg',
    handler: (apiKey, model) => createCohere({ apiKey }).languageModel(model),
    fetchModels: fetchCohereModels,
  },
  {
    id: LLMProvider.CUSTOM,
    name: 'Custom provider (OpenAI-compatible)',
    logo: '/static/images/llm.svg',
    handler: (apiKey, model, baseURL) => {
      return createOpenAI({
        apiKey: !apiKey || apiKey === 'not_set' ? 'not_required' : apiKey,
        baseURL: baseURL,
      }).chat(model);
    },
    fetchModels: fetchCustomProviderModels,
    isAcceptCustomApiUrl: true,
  },
];

export const getLLMProviderConfig = (
  provider: LLMProvider,
): LLMProviderSupported | undefined =>
  llmProviderSupported.find((p) => p.id === provider);

export const getEmbeddingModel = (
  config: AgentLLMConfig,
): EmbeddingModel | null => {
  const apiKey = config.apiKey ? decrypt(config.apiKey) : '';

  switch (config.provider) {
    case LLMProvider.OPENAI:
      return createOpenAI({ apiKey }).embedding('text-embedding-3-small');
    case LLMProvider.GEMINI:
      return createGoogleGenerativeAI({ apiKey }).textEmbeddingModel(
        'text-embedding-004',
      );
    case LLMProvider.KILO_CODE:
      return createOpenAI({
        apiKey,
        baseURL: 'https://api.kilo.ai/api/gateway',
      }).embedding('text-embedding-3-small');
    case LLMProvider.CUSTOM:
      return createOpenAI({
        apiKey: !apiKey || apiKey === 'not_set' ? 'not_required' : apiKey,
        baseURL: config.apiUrl,
      }).embedding('nomic-embed-text');
    default:
      return null;
  }
};
