import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { generateText } from 'ai';
import {
  AgentsConfigService,
  findDefaultLLMConfig,
  formatUserInstructions,
  withAgentConfig,
  withoutDisabledTools,
} from './agents.config';
import { AgentConfig } from './entities/agent-config.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { LLMProvider, SearchProvider } from './enums/agent.enums';
import { OrcaRouterCredentialService } from './orcarouter/orcarouter-credential.service';

jest.mock('@/common/utils/workspace-encryption.util', () => ({
  decryptWithDEK: (text: string) => text.replace(/^enc\((.*)\)$/, '$1'),
}));

const WS = 'ws-1';
const USER = 'user-1';

const llm = (id: string, model = 'gpt-5') =>
  ({ id, provider: LLMProvider.OPENAI, model }) as AgentLLMConfig;

const agentConfig = (patch: Partial<AgentConfig> = {}) =>
  ({
    workspaceId: WS,
    userId: USER,
    modelsConfig: {},
    searchProviders: [],
    disabledTools: [],
    ...patch,
  }) as AgentConfig;

describe('AgentsConfigService', () => {
  let service: AgentsConfigService;
  let configRepo: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let insert: { values: jest.Mock; orIgnore: jest.Mock; execute: jest.Mock };
  let llmRepo: { count: jest.Mock; findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    insert = {
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    configRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      // The row the conflict-safe insert created
      findOneOrFail: jest.fn(() => Promise.resolve(agentConfig())),
      save: jest.fn((v: AgentConfig) => Promise.resolve(v)),
      createQueryBuilder: jest.fn(() => ({ insert: () => insert })),
    };
    llmRepo = { count: jest.fn(), findOne: jest.fn(), update: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AgentsConfigService,
        { provide: getRepositoryToken(AgentConfig), useValue: configRepo },
        { provide: getRepositoryToken(AgentLLMConfig), useValue: llmRepo },
        {
          provide: WorkspaceEncryptionService,
          useValue: {
            encrypt: jest.fn((_ws: string, text: string) =>
              Promise.resolve(`enc(${text})`),
            ),
            getDEK: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: OrcaRouterCredentialService,
          useValue: {
            reportUnauthorized: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();
    service = module.get(AgentsConfigService);
  });

  it('returns defaults when the user has no config yet', async () => {
    await expect(service.get(WS, USER)).resolves.toEqual({
      modelsConfig: {},
      searchProviders: [],
      instruction: null,
      maxSteps: null,
      defaultAgentMode: null,
      defaultApprovalMode: null,
      disabledTools: [],
      responseLanguage: null,
    });
  });

  it('rejects models on connections the user does not own', async () => {
    llmRepo.count.mockResolvedValue(1);

    await expect(
      service.upsert(WS, USER, {
        modelsConfig: {
          default: { llmConfigId: 'a', model: 'gpt-5' },
          small: { llmConfigId: 'b', model: 'mini' },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(llmRepo.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ workspaceId: WS, userId: USER }),
    });
    expect(configRepo.save).not.toHaveBeenCalled();
  });

  it('creates the first row with a conflict-safe insert', async () => {
    llmRepo.count.mockResolvedValue(1);

    await service.upsert(WS, USER, { instruction: 'hi' });

    expect(insert.values).toHaveBeenCalledWith({
      workspaceId: WS,
      userId: USER,
    });
    expect(insert.orIgnore).toHaveBeenCalled();
    expect(configRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: 'hi' }),
    );
  });

  it('puts the default model on its connection, which chat reads', async () => {
    llmRepo.count.mockResolvedValue(1);

    await service.upsert(WS, USER, {
      modelsConfig: { default: { llmConfigId: 'a', model: 'gpt-5-mini' } },
    });

    expect(llmRepo.update).toHaveBeenCalledWith(
      { id: 'a', workspaceId: WS, userId: USER },
      { model: 'gpt-5-mini' },
    );
  });

  it('clears models and search providers with null', async () => {
    configRepo.findOne.mockResolvedValue(
      agentConfig({
        modelsConfig: { default: { llmConfigId: 'a', model: 'x' } },
        searchProviders: [
          { provider: SearchProvider.EXA, apiKey: 'k', isDefault: true },
        ],
      }),
    );

    await service.upsert(WS, USER, {
      modelsConfig: null,
      searchProviders: null,
    });

    expect(configRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ modelsConfig: {}, searchProviders: [] }),
    );
    expect(llmRepo.update).not.toHaveBeenCalled();
  });

  it('encrypts new search keys, keeps saved ones and picks one default', async () => {
    configRepo.findOne.mockResolvedValue(
      agentConfig({
        searchProviders: [
          { provider: SearchProvider.EXA, apiKey: 'saved', isDefault: true },
        ],
      }),
    );

    await service.upsert(WS, USER, {
      searchProviders: [
        { provider: SearchProvider.EXA },
        { provider: SearchProvider.FIRECRAWL, apiKey: 'fc-key' },
      ],
    });

    const saved = configRepo.save.mock.calls[0][0] as AgentConfig;
    expect(saved.searchProviders).toEqual([
      { provider: SearchProvider.EXA, apiKey: 'saved', isDefault: true },
      {
        provider: SearchProvider.FIRECRAWL,
        apiKey: 'enc(fc-key)',
        isDefault: false,
      },
    ]);
  });

  it('rejects a search provider without any key', async () => {
    await expect(
      service.upsert(WS, USER, {
        searchProviders: [{ provider: SearchProvider.TINYFISH }],
      }),
    ).rejects.toThrow('API key required for tinyfish');
  });

  it('rejects duplicate providers and two defaults', async () => {
    await expect(
      service.upsert(WS, USER, {
        searchProviders: [
          { provider: SearchProvider.EXA, apiKey: 'a' },
          { provider: SearchProvider.EXA, apiKey: 'b' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upsert(WS, USER, {
        searchProviders: [
          { provider: SearchProvider.EXA, apiKey: 'a', isDefault: true },
          { provider: SearchProvider.FIRECRAWL, apiKey: 'b', isDefault: true },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only changes the fields sent and clears with null', async () => {
    configRepo.findOne.mockResolvedValue(
      agentConfig({ instruction: 'old', maxSteps: 30, responseLanguage: 'vi' }),
    );

    await service.upsert(WS, USER, { instruction: null, maxSteps: 10 });

    expect(configRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: null,
        maxSteps: 10,
        responseLanguage: 'vi',
      }),
    );
  });

  it('keeps the limits when the default connection only changes model', async () => {
    configRepo.findOne.mockResolvedValue(
      agentConfig({
        modelsConfig: {
          default: { llmConfigId: 'a', model: 'gpt-5', contextWindow: 9000 },
        },
      }),
    );

    await service.setDefaultModel(WS, USER, 'a', 'gpt-5-mini');
    expect(configRepo.save.mock.calls[0][0].modelsConfig.default).toEqual({
      llmConfigId: 'a',
      model: 'gpt-5-mini',
      contextWindow: 9000,
    });

    await service.setDefaultModel(WS, USER, 'b', 'claude');
    expect(configRepo.save.mock.calls[1][0].modelsConfig.default).toEqual({
      llmConfigId: 'b',
      model: 'claude',
    });
  });

  it('drops every model ref to a deleted connection', async () => {
    configRepo.findOne.mockResolvedValue(
      agentConfig({
        modelsConfig: {
          default: { llmConfigId: 'a', model: 'x' },
          small: { llmConfigId: 'b', model: 'y' },
          subagents: [
            { llmConfigId: 'a', model: 'x' },
            { llmConfigId: 'b', model: 'z' },
          ],
        },
      }),
    );

    await service.removeLLMConfigRefs(WS, USER, 'a');

    expect(configRepo.save.mock.calls[0][0].modelsConfig).toEqual({
      default: undefined,
      small: { llmConfigId: 'b', model: 'y' },
      subagents: [{ llmConfigId: 'b', model: 'z' }],
    });
  });
});

describe('withAgentConfig', () => {
  const config = agentConfig({
    maxSteps: 40,
    modelsConfig: {
      default: {
        llmConfigId: 'a',
        model: 'gpt-5',
        contextWindow: 200_000,
        maxOutputTokens: 4096,
      },
    },
  });

  it('applies the limits of the matching model ref', () => {
    expect(withAgentConfig(llm('a'), config, 'gpt-5')).toMatchObject({
      id: 'a',
      model: 'gpt-5',
      contextWindow: 200_000,
      maxOutputTokens: 4096,
      maxSteps: 40,
    });
  });

  it('applies no model limits to another model on the same connection', () => {
    const resolved = withAgentConfig(llm('a'), config, 'gpt-5-mini');
    expect(resolved.contextWindow).toBeUndefined();
    expect(resolved.maxOutputTokens).toBeUndefined();
    expect(resolved.maxSteps).toBe(40);
  });
});

describe('withoutDisabledTools', () => {
  it('drops the tools the user turned off', () => {
    const tools = { a: 1, execute_remote_command: 2, b: 3 };
    expect(
      withoutDisabledTools(
        tools,
        agentConfig({ disabledTools: ['execute_remote_command'] }),
      ),
    ).toEqual({ a: 1, b: 3 });
    expect(withoutDisabledTools(tools, null)).toBe(tools);
  });
});

describe('findDefaultLLMConfig', () => {
  it('uses the default ref, else the oldest connection', async () => {
    const llmConfigs = { findOne: jest.fn() };
    const agentConfigs = { findOne: jest.fn() };
    const repos = { llmConfigs, agentConfigs } as never;
    const config = agentConfig({
      modelsConfig: { default: { llmConfigId: 'a', model: 'gpt-5-mini' } },
    });

    llmConfigs.findOne.mockResolvedValueOnce(llm('a', 'gpt-5'));
    await expect(
      findDefaultLLMConfig(repos, WS, USER, config),
    ).resolves.toMatchObject({ id: 'a', model: 'gpt-5-mini' });

    // Default connection deleted: falls back to the oldest one
    llmConfigs.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(llm('old', 'gpt-4o'));
    await expect(
      findDefaultLLMConfig(repos, WS, USER, config),
    ).resolves.toMatchObject({ id: 'old', model: 'gpt-4o' });
    expect(llmConfigs.findOne).toHaveBeenLastCalledWith({
      where: { workspaceId: WS, userId: USER },
      order: { createdAt: 'ASC' },
    });
  });
});

describe('formatUserInstructions', () => {
  it('is empty without instructions or language', () => {
    expect(formatUserInstructions(null)).toBe('');
    expect(formatUserInstructions(agentConfig({ instruction: '  ' }))).toBe('');
  });

  it('adds the instructions and the answer language', () => {
    expect(
      formatUserInstructions(
        agentConfig({ instruction: ' Use tables. ', responseLanguage: 'vi' }),
      ),
    ).toBe(
      '## User instructions\nUse tables.\n\nAlways answer in this language: vi',
    );
  });
});

describe('AgentsConfigService provider auth failures', () => {
  const orca = {
    id: 'cfg-1',
    workspaceId: WS,
    provider: LLMProvider.ORCAROUTER,
    model: 'orcarouter/auto',
    apiKey: 'sk-orca-key',
  } as AgentLLMConfig;

  const build = () => {
    const reportUnauthorized = jest.fn().mockResolvedValue(true);
    const service = new AgentsConfigService(
      {} as never,
      {} as never,
      {
        decrypt: jest.fn((_ws: string, text: string) => Promise.resolve(text)),
      } as unknown as WorkspaceEncryptionService,
      { reportUnauthorized } as unknown as OrcaRouterCredentialService,
    );
    return { service, reportUnauthorized };
  };

  const failWith = (status: number) =>
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'Unauthorized: denied' } }),
        { status, headers: { 'content-type': 'application/json' } },
      ),
    );
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  afterEach(() => jest.restoreAllMocks());

  it('reports a 401 from any request made with an OrcaRouter model', async () => {
    const { service, reportUnauthorized } = build();
    failWith(401);
    const model = await service.createLanguageModel(orca, WS);

    await expect(
      generateText({ model, prompt: 'hi', maxRetries: 0 }),
    ).rejects.toMatchObject({ statusCode: 401 });
    await flush();

    expect(reportUnauthorized).toHaveBeenCalledWith('cfg-1', 'sk-orca-key');
  });

  it('does not treat a 403 policy denial as a rejected key', async () => {
    const { service, reportUnauthorized } = build();
    failWith(403);
    const model = await service.createLanguageModel(orca, WS);

    await expect(
      generateText({ model, prompt: 'hi', maxRetries: 0 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await flush();

    expect(reportUnauthorized).not.toHaveBeenCalled();
  });

  it('reports failures emitted by other modules', async () => {
    const { service, reportUnauthorized } = build();
    await service.onLLMRequestFailed({ config: orca, error: { statusCode: 401 } });
    expect(reportUnauthorized).toHaveBeenCalledWith('cfg-1', 'sk-orca-key');
  });
});
