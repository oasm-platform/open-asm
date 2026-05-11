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

export type LLMModelsFetcher = (apiKey: string) => Promise<ProviderModelDto[]>;

export interface LLMProviderSupported {
  id: LLMProvider;
  name: string;
  logo: string;
  handler: LLMHandler;
  fetchModels: LLMModelsFetcher;
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
      data: Array<{ id: string; name?: string; supported_parameters?: string[] }>;
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
];

export const getLLMProviderConfig = (
  provider: LLMProvider,
): LLMProviderSupported | undefined =>
  llmProviderSupported.find((p) => p.id === provider);
