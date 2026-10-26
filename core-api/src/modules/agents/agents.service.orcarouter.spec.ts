/* eslint-disable @typescript-eslint/require-await */
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  decryptWithDEK,
  encryptWithDEK,
} from '@/common/utils/workspace-encryption.util';
import { AgentsService } from './agents.service';
import type { ProviderModelDto } from './dto/llm-config.dto';
import { LLMProvider } from './enums/agent.enums';

const mockFetchModels = jest.fn();

jest.mock('./llm-provider-supported', () => ({
  ...jest.requireActual<object>('./llm-provider-supported'),
  getLLMProviderConfig: () => ({
    name: 'OrcaRouter Cyber Inference',
    fetchModels: (apiKey: string, apiUrl?: string) =>
      mockFetchModels(apiKey, apiUrl) as Promise<ProviderModelDto[]>,
  }),
}));

const live: ProviderModelDto[] = [
  { id: 'orcarouter/auto', name: 'Auto' },
  { id: 'openai/gpt-5.5', name: 'GPT-5.5' },
];
const seed: ProviderModelDto[] = [
  { id: 'orcarouter/auto', name: 'Auto', isFallback: true },
];

interface Row {
  id: string;
  provider: LLMProvider;
  apiKey: string;
  model: string;
  workspaceId: string;
  userId: string;
}

function build(rows: Row[] = [], defaultId?: string) {
  const dek = randomBytes(32);
  const rejected = new Set<string>();
  const llmConfigRepository = {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
      rows.find((row) => row.id === where.id) ?? null,
    ),
    create: jest.fn((value: object) => ({ id: 'cfg-new', ...value })),
    save: jest.fn(async (value: object) => value),
  };
  const orcaRouterCredentials = {
    fromApiKey: (key: string) => {
      if (!key.trim().startsWith('sk-orca-')) {
        throw new BadRequestException('Keys start with "sk-orca-".');
      }
      return { apiKey: key.trim(), scope: 'api', source: 'api_key' };
    },
    isNeedsReauth: jest.fn(async (id: string, key: string) =>
      rejected.has(`${id}:${key}`),
    ),
    recordCredential: jest.fn(async (id: string, key: string) => {
      rejected.delete(`${id}:${key}`);
    }),
    reportUnauthorized: jest.fn(async (id: string, key: string) => {
      rejected.add(`${id}:${key}`);
      return true;
    }),
  };
  const redisService = { get: jest.fn(async () => null), setex: jest.fn() };
  const service = Object.assign(Object.create(AgentsService.prototype), {
    logger: { log: jest.fn(), warn: jest.fn() },
    llmConfigRepository,
    orcaRouterCredentials,
    redisService,
    workspaceEncryption: {
      getDEK: jest.fn(async () => dek),
      decrypt: jest.fn(async (_ws: string, value: string) =>
        decryptWithDEK(value, dek),
      ),
    },
    agentsConfig: {
      find: jest.fn(async () =>
        defaultId ? { modelsConfig: { default: { llmConfigId: defaultId } } } : null,
      ),
      setDefaultModel: jest.fn(),
    },
  }) as AgentsService;
  const row = (id: string, key: string): Row => ({
    id,
    provider: LLMProvider.ORCAROUTER,
    apiKey: encryptWithDEK(key, dek),
    model: 'orca/orcacyber-ultra-1.0',
    workspaceId: 'ws',
    userId: 'user',
  });
  return { service, rows, rejected, row, dek, llmConfigRepository, orcaRouterCredentials, redisService };
}

const create = (service: AgentsService, apiKey: string, issued = false) =>
  service.createLLMConfig(
    { provider: LLMProvider.ORCAROUTER, apiKey, name: 'Orca' },
    'ws',
    'user',
    issued,
  );

beforeEach(() => mockFetchModels.mockReset());

describe('AgentsService OrcaRouter key verification', () => {
  it('checks the key format before calling the catalog', async () => {
    const { service } = build();
    await expect(create(service, 'sk-other-provider')).rejects.toThrow(/sk-orca-/);
    expect(mockFetchModels).not.toHaveBeenCalled();
  });

  it('does not save a pasted key the live catalog could not confirm', async () => {
    const { service, llmConfigRepository } = build();
    mockFetchModels.mockResolvedValue(seed);
    await expect(create(service, 'sk-orca-typo')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(llmConfigRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a key the catalog refuses', async () => {
    const { service } = build();
    mockFetchModels.mockResolvedValue([]);
    await expect(create(service, 'sk-orca-revoked')).rejects.toThrow(/invalid API key/);
  });

  it('stores a key OrcaRouter just issued even before the catalog accepts it', async () => {
    const { service, llmConfigRepository } = build();
    mockFetchModels.mockResolvedValue([]);
    await expect(create(service, 'sk-orca-issued', true)).resolves.toMatchObject({
      model: 'orcarouter/auto',
    });
    expect(llmConfigRepository.save).toHaveBeenCalledTimes(1);
  });
});

describe('AgentsService OrcaRouter reconnect', () => {
  it('replaces the key on the rejected connection instead of adding a row', async () => {
    const { service, rows, rejected, row, dek, llmConfigRepository } = build();
    rows.push(row('cfg-ok', 'sk-orca-ok'), row('cfg-broken', 'sk-orca-old'));
    rejected.add('cfg-broken:sk-orca-old');
    mockFetchModels.mockResolvedValue(live);

    const result = await create(service, 'sk-orca-replacement');

    expect(result.id).toBe('cfg-broken');
    expect(llmConfigRepository.create).not.toHaveBeenCalled();
    expect(decryptWithDEK(rows[1].apiKey, dek)).toBe('sk-orca-replacement');
    // Keeps the model the user picked
    expect(rows[1].model).toBe('orca/orcacyber-ultra-1.0');
    await expect(
      service.getConnectedProviders('ws', 'user'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ configId: 'cfg-broken', needsReauth: false }),
      ]),
    );
  });

  it('prefers the default connection when several are rejected', async () => {
    const { service, rows, rejected, row } = build([], 'cfg-default');
    rows.push(row('cfg-other', 'sk-orca-a'), row('cfg-default', 'sk-orca-b'));
    rejected.add('cfg-other:sk-orca-a');
    rejected.add('cfg-default:sk-orca-b');
    mockFetchModels.mockResolvedValue(live);

    await expect(create(service, 'sk-orca-new')).resolves.toMatchObject({
      id: 'cfg-default',
    });
  });

  it('adds a new connection when none is rejected', async () => {
    const { service, rows, row, llmConfigRepository } = build();
    rows.push(row('cfg-ok', 'sk-orca-ok'));
    mockFetchModels.mockResolvedValue(live);

    await expect(create(service, 'sk-orca-second')).resolves.toMatchObject({
      id: 'cfg-new',
    });
    expect(llmConfigRepository.create).toHaveBeenCalledTimes(1);
  });
});

describe('AgentsService OrcaRouter model discovery', () => {
  it('flags a key the catalog refuses and does not cache the empty list', async () => {
    const { service, rows, row, orcaRouterCredentials, redisService } = build();
    rows.push(row('cfg-1', 'sk-orca-revoked'));
    mockFetchModels.mockResolvedValue([]);

    await expect(service.getModelsForProvider('cfg-1', 'ws', 'user')).resolves.toEqual([]);
    expect(orcaRouterCredentials.reportUnauthorized).toHaveBeenCalledWith(
      'cfg-1',
      'sk-orca-revoked',
    );
    expect(redisService.setex).not.toHaveBeenCalled();
  });

  it('does not cache the offline seed, only a live catalog', async () => {
    const { service, rows, row, redisService } = build();
    rows.push(row('cfg-1', 'sk-orca-key'));

    mockFetchModels.mockResolvedValue(seed);
    await service.getModelsForProvider('cfg-1', 'ws', 'user');
    expect(redisService.setex).not.toHaveBeenCalled();

    mockFetchModels.mockResolvedValue(live);
    await service.getModelsForProvider('cfg-1', 'ws', 'user');
    expect(redisService.setex).toHaveBeenCalledTimes(1);
  });
});
