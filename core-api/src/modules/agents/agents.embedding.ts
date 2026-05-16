import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createCohere } from '@ai-sdk/cohere';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import { EmbeddingProvider } from './enums/agent.enums';
import type { AgentEmbeddingConfig } from './entities/agent-embedding.entity';
import { decrypt } from '@/common/utils/encryption.util';

export type EmbeddingModelInfo = {
  id: string;
  name: string;
  dimensions: number;
};

export interface EmbeddingProviderSupported {
  id: EmbeddingProvider;
  name: string;
  logo: string;
  models: EmbeddingModelInfo[];
  handler: (apiKey: string, model: string, baseURL?: string) => EmbeddingModel;
  isAcceptCustomApiUrl?: boolean;
}

export const embeddingProviderSupported: EmbeddingProviderSupported[] = [
  {
    id: EmbeddingProvider.OPENAI,
    name: 'OpenAI',
    logo: '/static/images/openai.svg',
    models: [
      {
        id: 'text-embedding-3-large',
        name: 'text-embedding-3-large',
        dimensions: 3072,
      },
      {
        id: 'text-embedding-3-small',
        name: 'text-embedding-3-small',
        dimensions: 1536,
      },
      {
        id: 'text-embedding-ada-002',
        name: 'text-embedding-ada-002',
        dimensions: 1536,
      },
    ],
    handler: (apiKey, model) => createOpenAI({ apiKey }).embedding(model),
  },
  {
    id: EmbeddingProvider.GEMINI,
    name: 'Google Gemini',
    logo: '/static/images/gemini.svg',
    models: [
      {
        id: 'gemini-embedding-001',
        name: 'gemini-embedding-001',
        dimensions: 3072,
      },
      {
        id: 'gemini-embedding-2-preview',
        name: 'gemini-embedding-2-preview',
        dimensions: 3072,
      },
    ],
    handler: (apiKey, model) =>
      createGoogleGenerativeAI({ apiKey }).textEmbeddingModel(model),
  },
  {
    id: EmbeddingProvider.MISTRAL,
    name: 'Mistral',
    logo: '/static/images/llm.svg',
    models: [{ id: 'mistral-embed', name: 'mistral-embed', dimensions: 1024 }],
    handler: (apiKey, model) => createMistral({ apiKey }).embedding(model),
  },
  {
    id: EmbeddingProvider.COHERE,
    name: 'Cohere',
    logo: '/static/images/llm.svg',
    models: [
      {
        id: 'embed-english-v3.0',
        name: 'embed-english-v3.0',
        dimensions: 1024,
      },
      {
        id: 'embed-multilingual-v3.0',
        name: 'embed-multilingual-v3.0',
        dimensions: 1024,
      },
      {
        id: 'embed-english-light-v3.0',
        name: 'embed-english-light-v3.0',
        dimensions: 384,
      },
      {
        id: 'embed-multilingual-light-v3.0',
        name: 'embed-multilingual-light-v3.0',
        dimensions: 384,
      },
    ],
    handler: (apiKey, model) => createCohere({ apiKey }).embedding(model),
  },
  {
    id: EmbeddingProvider.CUSTOM,
    name: 'Custom (OpenAI-compatible)',
    logo: '/static/images/llm.svg',
    models: [],
    handler: (apiKey, model, baseURL) =>
      createOpenAI({
        apiKey: !apiKey || apiKey === 'not_set' ? 'not_required' : apiKey,
        baseURL,
      }).embedding(model),
    isAcceptCustomApiUrl: true,
  },
];

export const getEmbeddingProviderConfig = (
  provider: EmbeddingProvider,
): EmbeddingProviderSupported | undefined =>
  embeddingProviderSupported.find((p) => p.id === provider);

export const getEmbeddingModelFromConfig = (
  config: AgentEmbeddingConfig,
): EmbeddingModel | null => {
  const providerConfig = getEmbeddingProviderConfig(config.provider);
  if (!providerConfig) return null;

  const apiKey = config.apiKey ? decrypt(config.apiKey) : '';
  return providerConfig.handler(apiKey, config.model, config.apiUrl);
};
