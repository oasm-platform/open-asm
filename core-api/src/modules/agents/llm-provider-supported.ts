import { LLMProvider } from './enums/agent.enums';

interface LLMProviderSupported {
  id: LLMProvider;
  name: string;
  logo: string;
}

export const llmProviderSupported: LLMProviderSupported[] = [
  {
    id: LLMProvider.OPENROUTER,
    name: 'Open Router',
    logo: '/static/images/openrouter.svg',
  },
  {
    id: LLMProvider.OPENAI,
    name: 'OpenAI',
    logo: '/static/images/openai.svg',
  },
  {
    id: LLMProvider.GEMINI,
    name: 'Google Gemini',
    logo: '/static/images/gemini.svg',
  },
  {
    id: LLMProvider.KILO_CODE,
    name: 'Kilo Gateway',
    logo: '/static/images/kilocode.svg',
  },
];
