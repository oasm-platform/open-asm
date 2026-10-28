import { LLMProvider } from './enums/agent.enums';
import { getLLMProviderConfig } from './llm-provider-supported';

const provider = getLLMProviderConfig(LLMProvider.CHEAPER_INFERENCE)!;

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const respond = (keyStatus: number, catalog: unknown = { models: [] }) =>
  jest.spyOn(global, 'fetch').mockImplementation((input) =>
    Promise.resolve(
      String(input).endsWith('/public/models')
        ? json(200, catalog)
        : json(keyStatus, { data: [] }),
    ),
  );

afterEach(() => jest.restoreAllMocks());

describe('Cheaper Inference provider', () => {
  it('lists only text models served over chat completions', async () => {
    const fetchMock = respond(200, {
      models: [
        {
          id: 'gpt-5.4-mini',
          model_type: 'text',
          supported_endpoints: ['/v1/chat/completions', '/v1/responses'],
        },
        {
          id: 'deepseek-v4-flash',
          model_type: 'text',
          supported_endpoints: ['/v1/chat/completions'],
        },
        {
          id: 'a/responses-only',
          model_type: 'text',
          supported_endpoints: ['/v1/responses'],
        },
        {
          id: 'a/embedding',
          model_type: 'embedding',
          supported_endpoints: ['/v1/embeddings'],
        },
        { id: 'a/no-metadata' },
      ],
    });

    const models = await provider.fetchModels('ci-key');

    expect(models).toEqual([
      { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
      { id: 'gpt-5.4-mini', name: 'gpt-5.4-mini' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cheaperinference.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer ci-key' },
      }),
    );
  });

  it('returns no models for a rejected key, so the key is not saved', async () => {
    const fetchMock = respond(401);
    await expect(provider.fetchModels('ci-bad')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
