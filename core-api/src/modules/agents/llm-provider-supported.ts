import { LLMProvider } from './enums/agent.enums';

interface LLMProviderSupported {
  id: LLMProvider;
  name: string;
}

export const llmProviderSupported: LLMProviderSupported[] = [
  {
    id: LLMProvider.OPENROUTER,
    name: 'OpenRouter',
  },
];
