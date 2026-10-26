import { LLMProvider } from './enums/agent.enums';
import { getLLMProviderConfig } from './llm-provider-supported';

const provider = getLLMProviderConfig(LLMProvider.ORCAROUTER)!;

const respond = (status: number, body: unknown = {}) =>
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

afterEach(() => jest.restoreAllMocks());

describe('OrcaRouter provider', () => {
  it('lists only models served over OpenAI chat completions', async () => {
    const fetchMock = respond(200, {
      data: [
        { id: 'orcarouter/auto', name: 'Auto', supported_endpoint_types: ['openai'] },
        { id: 'a/both', supported_endpoint_types: ['anthropic', 'openai'] },
        { id: 'a/messages-only', supported_endpoint_types: ['anthropic'] },
        { id: 'a/image', supported_endpoint_types: ['image-generation'] },
        { id: 'a/no-metadata' },
      ],
    });

    const models = await provider.fetchModels('sk-orca-key');

    expect(models).toEqual([
      { id: 'a/both', name: 'a/both' },
      { id: 'orcarouter/auto', name: 'Auto' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.orcarouter.ai/v1/models?capability=chat',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-orca-key' },
      }),
    );
  });

  it('returns no models for a rejected key, so the key is not saved', async () => {
    respond(401);
    await expect(provider.fetchModels('sk-orca-bad')).resolves.toEqual([]);
  });
});
