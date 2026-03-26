import { LLMProvider } from './enums/agent.enums';

interface LLMProviderSupported {
  id: LLMProvider;
  name: string;
  logo: string;
}

export const llmProviderSupported: LLMProviderSupported[] = [
  {
    id: LLMProvider.OPENROUTER,
    name: 'OpenRouter',
    logo: '/static/images/openrouter.svg',
  },
  {
    id: LLMProvider.OPENAI,
    name: 'OpenAI',
    logo: '/static/images/openai.svg',
  },
];
