/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { AgentsCompletionsService } from './agents.completions';
import { AgentsService } from './agents.service';
import type { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { LLMProvider } from './enums/agent.enums';
import type { SendMessageDto } from './dto/message.dto';

jest.mock('@/common/utils/encryption.util', () => ({
  encrypt: (text: string) => `enc(${text})`,
}));
jest.mock('@/common/utils/workspace-encryption.util', () => ({
  encryptWithDEK: (text: string) => `enc(${text})`,
  decryptWithDEK: (text: string) => text,
}));
jest.mock('./llm-provider-supported', () => ({
  ...jest.requireActual('./llm-provider-supported'),
  getLLMProviderConfig: () => ({
    name: 'OpenAI',
    fetchModels: async () => [{ id: 'gpt-5', name: 'GPT-5' }],
  }),
}));

const WS = 'ws-1';
const USER = 'user-1';

const conn = (id: string, model: string, provider = LLMProvider.OPENAI) =>
  ({ id, model, provider, apiKey: 'key', workspaceId: WS }) as AgentLLMConfig;

/** AgentsService with only the collaborators the LLM config paths touch. */
function buildService(defaultId?: string, existing?: AgentLLMConfig) {
  const agentsConfig = {
    find: jest.fn(async () =>
      defaultId
        ? { modelsConfig: { default: { llmConfigId: defaultId, model: 'm' } } }
        : null,
    ),
    setDefaultModel: jest.fn(async () => undefined),
    removeLLMConfigRefs: jest.fn(async () => undefined),
  };
  const llmConfigRepository = {
    findOne: jest.fn(async () => existing ?? null),
    create: jest.fn((v) => ({ id: 'new', ...v })),
    save: jest.fn(async (v) => v),
    remove: jest.fn(async () => undefined),
  };
  const service = Object.assign(Object.create(AgentsService.prototype), {
    agentsConfig,
    llmConfigRepository,
    workspaceEncryption: { getDEK: jest.fn(async () => null) },
  }) as AgentsService;
  return { service, agentsConfig };
}

describe('AgentsService keeps the default model in agent config', () => {
  it('makes the first connection the default, and only the first', async () => {
    const dto = { provider: LLMProvider.OPENAI, apiKey: 'sk' };

    const first = buildService();
    const created = await first.service.createLLMConfig(dto, WS, USER);
    expect(first.agentsConfig.setDefaultModel).toHaveBeenCalledWith(
      WS,
      USER,
      'new',
      'gpt-5',
    );
    expect(created.isPreferred).toBe(true);

    const second = buildService('other');
    const next = await second.service.createLLMConfig(dto, WS, USER);
    expect(second.agentsConfig.setDefaultModel).not.toHaveBeenCalled();
    expect(next.isPreferred).toBe(false);
  });

  it('moves the default model only for the default connection', async () => {
    const onDefault = buildService('a', conn('a', 'gpt-5'));
    await onDefault.service.updateLLMConfig('a', { model: 'gpt-5-mini' }, WS, USER);
    expect(onDefault.agentsConfig.setDefaultModel).toHaveBeenCalledWith(
      WS,
      USER,
      'a',
      'gpt-5-mini',
    );

    const onOther = buildService('a', conn('b', 'claude'));
    const res = await onOther.service.updateLLMConfig(
      'b',
      { model: 'claude-2' },
      WS,
      USER,
    );
    expect(onOther.agentsConfig.setDefaultModel).not.toHaveBeenCalled();
    expect(res.isPreferred).toBe(false);
  });

  it('makes a connection the default when asked', async () => {
    const { service, agentsConfig } = buildService('a', conn('b', 'claude'));

    const res = await service.updateLLMConfig('b', { isPreferred: true }, WS, USER);

    expect(agentsConfig.setDefaultModel).toHaveBeenCalledWith(
      WS,
      USER,
      'b',
      'claude',
    );
    expect(res.isPreferred).toBe(true);
  });

  it('drops model refs to a deleted connection', async () => {
    const { service, agentsConfig } = buildService('a', conn('a', 'gpt-5'));

    await service.deleteLLMConfig('a', WS, USER);

    expect(agentsConfig.removeLLMConfigRefs).toHaveBeenCalledWith(WS, USER, 'a');
  });
});

describe('AgentsCompletionsService model for a later message', () => {
  const resolve = (
    dto: Partial<SendMessageDto>,
    defaultRef?: { llmConfigId: string; model: string; contextWindow?: number },
  ) => {
    const byId: Record<string, AgentLLMConfig> = {
      a: conn('a', 'gpt-5'),
      b: conn('b', 'claude', LLMProvider.ANTHROPIC),
    };
    const service = Object.assign(
      Object.create(AgentsCompletionsService.prototype),
      {
        llmConfigRepository: {
          findOne: jest.fn(async ({ where }) =>
            where.id ? byId[where.id] : byId.b,
          ),
        },
        agentsConfig: {
          find: jest.fn(async () =>
            defaultRef ? { modelsConfig: { default: defaultRef } } : null,
          ),
        },
      },
    );
    return service.resolveLLMConfigWithOverrides(
      { llmConfigId: 'a' },
      dto,
      WS,
      USER,
    ) as Promise<AgentLLMConfig & { contextWindow?: number }>;
  };

  it("keeps the user's per-message model over the default", async () => {
    const r = await resolve(
      { provider: LLMProvider.OPENAI, model: 'gpt-4o' },
      { llmConfigId: 'a', model: 'gpt-5-mini', contextWindow: 400_000 },
    );
    expect(r.model).toBe('gpt-4o');
    expect(r.contextWindow).toBeUndefined();
  });

  it('runs the default model, with its limits, on the default connection', async () => {
    const r = await resolve(
      {},
      { llmConfigId: 'a', model: 'gpt-5-mini', contextWindow: 400_000 },
    );
    expect(r).toMatchObject({ id: 'a', model: 'gpt-5-mini', contextWindow: 400_000 });
  });

  it("switches provider to that provider's connection and model", async () => {
    const r = await resolve(
      { provider: LLMProvider.ANTHROPIC },
      { llmConfigId: 'a', model: 'gpt-5-mini' },
    );
    expect(r).toMatchObject({ id: 'b', model: 'claude' });
  });
});
