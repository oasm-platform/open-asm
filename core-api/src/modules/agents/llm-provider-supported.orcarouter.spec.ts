 
import { LLMProvider } from './enums/agent.enums';
import type * as ProviderModule from './llm-provider-supported';

const createOpenAI = jest.fn((_options: unknown) => ({
  chat: (model: string) => ({ modelId: model }),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (options: unknown) => createOpenAI(options) as never,
}));

const load = () =>
  jest.requireActual<typeof ProviderModule>('./llm-provider-supported');

describe('OrcaRouter provider registration', () => {
  beforeEach(() => createOpenAI.mockClear());

  it('is a first-class named provider, not a custom-endpoint passthrough', () => {
    const { llmProviderSupported, getLLMProviderConfig } = load();
    const provider = getLLMProviderConfig(LLMProvider.ORCAROUTER);
    expect(provider?.name).toBe('OrcaRouter Cyber Inference');
    expect(provider?.logo).toBe('/static/images/orcarouter.png');
    expect(provider?.isAcceptCustomApiUrl).toBeFalsy();
    expect(
      llmProviderSupported.filter((entry) => entry.id === LLMProvider.ORCAROUTER),
    ).toHaveLength(1);
  });

  it('routes inference to the API origin, with an explicit self-hosted override', () => {
    const { getLLMProviderConfig } = load();
    delete process.env.ORCA_API_BASE_URL;
    delete process.env.ORCA_BASE_URL;
    getLLMProviderConfig(LLMProvider.ORCAROUTER)?.handler(
      'sk-orca-key',
      'orcarouter/auto',
    );
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-orca-key',
      baseURL: 'https://api.orcarouter.ai/v1',
    });

    process.env.ORCA_API_BASE_URL = 'https://relay.example/v1';
    try {
      getLLMProviderConfig(LLMProvider.ORCAROUTER)?.handler(
        'sk-orca-key',
        'orcarouter/auto',
      );
      expect(createOpenAI).toHaveBeenLastCalledWith({
        apiKey: 'sk-orca-key',
        baseURL: 'https://relay.example/v1',
      });
    } finally {
      delete process.env.ORCA_API_BASE_URL;
    }
  });
});
