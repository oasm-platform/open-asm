import { LLMProvider } from './enums/agent.enums';
import { getLLMProviderConfig } from './llm-provider-supported';

const provider = getLLMProviderConfig(LLMProvider.OPPER)!;

const respond = (status: number, body: unknown = {}) =>
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

afterEach(() => jest.restoreAllMocks());

describe('Opper provider', () => {
  it('lists only chat models that can call tools', async () => {
    const fetchMock = respond(200, {
      object: 'list',
      data: [
        { id: 'claude-sonnet-4-6', opper: { type: 'llm', capabilities: ['text', 'tools', 'vision'] } },
        { id: 'anthropic/claude-sonnet-4-6', opper: { type: 'llm', capabilities: ['text', 'tools'] } },
        { id: 'text-only', opper: { type: 'llm', capabilities: ['text'] } },
        { id: 'text-embedding-3-small', opper: { type: 'embedding', capabilities: ['text'] } },
        { id: 'no-metadata' },
      ],
    });

    const models = await provider.fetchModels('op-key');

    expect(models).toEqual([
      { id: 'anthropic/claude-sonnet-4-6', name: 'anthropic/claude-sonnet-4-6' },
      { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.opper.ai/v3/compat/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer op-key' },
      }),
    );
  });

  it('returns no models for a rejected key, so the key is not saved', async () => {
    respond(401);
    await expect(provider.fetchModels('op-bad')).resolves.toEqual([]);
  });
});
