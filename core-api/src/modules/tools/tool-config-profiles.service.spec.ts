/* eslint-disable @typescript-eslint/no-unsafe-return */
import { BadRequestException, ConflictException } from '@nestjs/common';

import type { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';
import { _resetValidatorCache } from '@/modules/tools/validators/tool-config-profiles.validator';
import type { Tool } from '@/modules/tools/entities/tools.entity';
import type { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import type { Repository } from 'typeorm';
import type { ToolConfigProfile } from './entities/tool-config-profiles.entity';
import {
  decryptProfile,
  encryptProfile,
} from './validators/tool-config-profiles.crypto';
import { ToolConfigProfilesService } from './tool-config-profiles.service';

// --- Mocks ---
const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  manager: { transaction: jest.fn() },
});

const nucleiSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    severity: {
      type: 'array',
      items: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
    },
    tags: { type: 'array', items: { type: 'string' } },
    rateLimit: { type: 'integer' },
    concurrency: { type: 'integer' },
    followRedirects: { type: 'boolean' },
  },
  additionalProperties: false,
};

const schemaWithPassword: Record<string, unknown> = {
  type: 'object',
  properties: {
    apiKey: { type: 'string', 'ui:widget': 'password' },
    target: { type: 'string' },
  },
};

describe('ToolConfigProfilesService', () => {
  let service: ToolConfigProfilesService;
  let profilesRepo: ReturnType<typeof mockRepo>;
  let toolsRepo: ReturnType<typeof mockRepo>;
  let connectorRegistry: ConnectorRegistryService;
  let encryptionService: WorkspaceEncryptionService;
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    _resetValidatorCache();
    profilesRepo = mockRepo();
    toolsRepo = mockRepo();

    connectorRegistry = {
      getConnector: jest.fn(),
    } as unknown as ConnectorRegistryService;

    encryptionService = {
      getDEK: jest.fn().mockResolvedValue(Buffer.alloc(32)),
    } as unknown as WorkspaceEncryptionService;

    dataSource = { transaction: jest.fn() };

    service = new ToolConfigProfilesService(
      profilesRepo as unknown as Repository<ToolConfigProfile>,
      toolsRepo as unknown as Repository<Tool>,
      connectorRegistry,
      encryptionService,
      dataSource as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const wsId = 'ws-000';
  const toolId = 'tool-000';
  const mockTool = { id: toolId, name: 'nuclei' } as Tool;
  const mockProfile = (overrides: Partial<ToolConfigProfile> = {}) =>
    ({
      id: 'prof-001',
      name: 'default',
      config: { severity: ['high'] },
      isDefault: false,
      tool: mockTool,
      workspace: { id: wsId },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as unknown as ToolConfigProfile;

  // ── CREATE ───────────────────────────────────────────────────────────

  it('create happy — encrypts sensitive fields before save', async () => {
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: schemaWithPassword,
    });
    toolsRepo.findOne.mockResolvedValue(mockTool);
    profilesRepo.save.mockImplementation((p) => p);
    profilesRepo.create.mockImplementation((p) => p);

    const result = await service.create(wsId, toolId, {
      name: 'prod',
      config: { apiKey: 'secret123', target: 'example.com' },
    });

    // The saved entity must have encrypted apiKey, plain target
    expect(profilesRepo.save).toHaveBeenCalledTimes(1);
    const savedConfig = (profilesRepo.save.mock.calls[0][0] as ToolConfigProfile).config;
    expect(savedConfig.apiKey).not.toBe('secret123');
    expect(savedConfig.target).toBe('example.com');
    expect(result).toBeDefined();
  });

  it('create — duplicate name returns 409', async () => {
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: nucleiSchema,
    });
    toolsRepo.findOne.mockResolvedValue(mockTool);
    // findOne for duplicate check returns existing profile
    profilesRepo.findOne.mockResolvedValue(mockProfile());

    await expect(
      service.create(wsId, toolId, { name: 'default', config: {} }),
    ).rejects.toThrow(ConflictException);
  });

  it('create — invalid config returns 400 with Ajv error paths', async () => {
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: nucleiSchema,
    });
    toolsRepo.findOne.mockResolvedValue(mockTool);
    profilesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create(wsId, toolId, {
        name: 'bad',
        config: { severity: ['invalid'] },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('create — unknown tool throws', async () => {
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue(null);
    toolsRepo.findOne.mockResolvedValue(mockTool);

    await expect(
      service.create(wsId, toolId, { name: 'x', config: {} }),
    ).rejects.toThrow(/unknown tool/i);
  });

  it('create — no-schema connector: succeeds and stores config as-is', async () => {
    // Known connector with NEITHER configSchema NOR inputsSchema
    // (e.g. wpscan) needs no config — creation must not throw.
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'wpscan',
      slug: 'wpscan',
      // neither configSchema nor inputsSchema present
    });
    toolsRepo.findOne.mockResolvedValue({ id: toolId, name: 'wpscan' });
    profilesRepo.findOne.mockResolvedValue(null);
    profilesRepo.save.mockImplementation((p) => p);
    profilesRepo.create.mockImplementation((p) => p);

    const result = await service.create(wsId, toolId, {
      name: 'qa-wpscan',
      config: { url: 'https://example.com' },
    });

    expect(result).toBeDefined();
    expect(profilesRepo.save).toHaveBeenCalledTimes(1);
    // No schema → no validation → config persisted byte-for-byte (no encryption)
    const savedConfig = (profilesRepo.save.mock.calls[0][0] as ToolConfigProfile).config;
    expect(savedConfig).toEqual({ url: 'https://example.com' });
  });

  // ── Fallback: configSchema absent → inputsSchema used ────────────
  it('create — uses inputsSchema fallback when configSchema absent', async () => {
    const inputsSchema = {
      type: 'object',
      properties: { target: { type: 'string', format: 'uri' } },
      required: ['target'],
    };
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'wpscan', slug: 'wpscan',
      // no configSchema — should fall back to inputsSchema
      inputsSchema,
    });
    toolsRepo.findOne.mockResolvedValue({ id: toolId, name: 'wpscan' });
    profilesRepo.findOne.mockResolvedValue(null);
    profilesRepo.save.mockImplementation((p) => p);
    profilesRepo.create.mockImplementation((p) => p);

    const result = await service.create(wsId, toolId, {
      name: 'default',
      config: { target: 'https://example.com' },
    });
    expect(result).toBeDefined();
    expect(profilesRepo.save).toHaveBeenCalledTimes(1);
  });

  it('create — rejects invalid config against inputsSchema fallback', async () => {
    const inputsSchema = {
      type: 'object',
      properties: { target: { type: 'string', format: 'uri' } },
      required: ['target'],
    };
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'wpscan', slug: 'wpscan',
      inputsSchema,
    });
    toolsRepo.findOne.mockResolvedValue({ id: toolId, name: 'wpscan' });
    profilesRepo.findOne.mockResolvedValue(null);

    // Missing required 'target' field — should fail validation
    await expect(
      service.create(wsId, toolId, { name: 'bad', config: {} }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── maskConfig uses fallback schema ────────────────────────────────
  it('list — masks sensitive fields from inputsSchema fallback', async () => {
    const inputsSchemaWithPassword = {
      type: 'object',
      properties: {
        apiKey: { type: 'string', 'ui:widget': 'password' },
        target: { type: 'string' },
      },
    };
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'wpscan', slug: 'wpscan',
      inputsSchema: inputsSchemaWithPassword,
      // no configSchema
    });
    const profile = mockProfile({
      config: { apiKey: 'secretvalue123', target: 'example.com' },
    });
    profilesRepo.find.mockResolvedValue([profile]);

    const result = await service.list(wsId, toolId);

    expect(result).toHaveLength(1);
    const cfg = result[0].config;
    expect(cfg.apiKey).toMatch(/^\*\*\*\*/);
    expect(cfg.target).toBe('example.com');
  });

  it('create — isDefault defaults to false', async () => {
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: nucleiSchema,
    });
    toolsRepo.findOne.mockResolvedValue(mockTool);
    profilesRepo.findOne.mockResolvedValue(null);
    profilesRepo.save.mockImplementation((p) => p);
    profilesRepo.create.mockImplementation((p) => p);

    await service.create(wsId, toolId, { name: 'no-default', config: {} });

    const saved = profilesRepo.save.mock.calls[0][0] as ToolConfigProfile;
    expect(saved.isDefault).toBe(false);
  });

  it('create — empty config allowed', async () => {
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: nucleiSchema,
    });
    toolsRepo.findOne.mockResolvedValue(mockTool);
    profilesRepo.findOne.mockResolvedValue(null);
    profilesRepo.save.mockImplementation((p) => p);
    profilesRepo.create.mockImplementation((p) => p);

    const result = await service.create(wsId, toolId, {
      name: 'empty',
      config: {},
    });
    expect(result).toBeDefined();
  });

  // ── UPDATE ───────────────────────────────────────────────────────────

  it('update happy — re-validates and encrypts', async () => {
    const existing = mockProfile({
      config: { apiKey: 'old-encrypted', target: 'old.com' },
    });
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: schemaWithPassword,
    });
    toolsRepo.findOne.mockResolvedValue(mockTool);
    profilesRepo.findOne
      .mockResolvedValueOnce(existing) // findOwned
      .mockResolvedValueOnce(null);    // dup check (new name unique)
    profilesRepo.save.mockImplementation((p) => p);

    await service.update(wsId, 'prof-001', {
      name: 'updated',
      config: { apiKey: 'newsecret', target: 'new.com' },
    });

    const savedConfig = (profilesRepo.save.mock.calls[0][0] as ToolConfigProfile).config;
    expect(savedConfig.apiKey).not.toBe('newsecret');
    expect(savedConfig.target).toBe('new.com');
  });

  it('update — no-schema connector: new config succeeds, stored as-is', async () => {
    const existing = mockProfile({
      id: 'prof-wpscan',
      name: 'qa-wpscan',
      config: {},
    });
    // Known connector without a schema (wpscan)
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'wpscan',
      slug: 'wpscan',
    });
    toolsRepo.findOne.mockResolvedValue({ id: toolId, name: 'wpscan' });
    profilesRepo.findOne
      .mockResolvedValueOnce(existing) // findOwned
      .mockResolvedValueOnce(null);    // dup check (new name unique)
    profilesRepo.save.mockImplementation((p) => p);

    await service.update(wsId, 'prof-wpscan', {
      name: 'qa-wpscan-v2',
      config: { url: 'https://new.example.com' },
    });

    expect(profilesRepo.save).toHaveBeenCalledTimes(1);
    const saved = profilesRepo.save.mock.calls[0][0] as ToolConfigProfile;
    expect(saved.name).toBe('qa-wpscan-v2');
    // No schema → no validation → config persisted unchanged
    expect(saved.config).toEqual({ url: 'https://new.example.com' });
  });

  it('update — rename/isDefault only does NOT re-encrypt ciphertext (round-trips to original plaintext)', async () => {
    const dek = Buffer.alloc(32);
    const encrypted = encryptProfile(
      { apiKey: 'secret123', target: 'x.com' },
      ['apiKey'],
      dek,
    );
    const existing = mockProfile({
      id: 'prof-001',
      name: 'default',
      config: encrypted,
    });
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nessus',
      slug: 'nessus',
      configSchema: schemaWithPassword,
    });
    toolsRepo.findOne.mockResolvedValue({ id: toolId, name: 'nessus' });
    profilesRepo.findOne
      .mockResolvedValueOnce(existing) // findOwned
      .mockResolvedValueOnce(null);    // dup check (new name unique)
    profilesRepo.save.mockImplementation((p) => p);

    await service.update(wsId, 'prof-001', { name: 'renamed' });

    expect(profilesRepo.save).toHaveBeenCalledTimes(1);
    const saved = profilesRepo.save.mock.calls[0][0] as ToolConfigProfile;
    expect(saved.name).toBe('renamed');
    // Decrypting the persisted config must yield the ORIGINAL plaintext.
    // A second encryption pass over ciphertext (double-encrypt) would leave
    // one decrypt layer's output still encrypted, failing this assertion.
    expect(decryptProfile(saved.config, ['apiKey'], dek)).toEqual({
      apiKey: 'secret123',
      target: 'x.com',
    });
  });

  // ── setDefault ───────────────────────────────────────────────────────

  it('setDefault switches old default off atomically', async () => {
    const oldDefault = mockProfile({
      id: 'prof-old',
      isDefault: true,
      config: {},
    });
    const target = mockProfile({ id: 'prof-new', isDefault: false, config: {} });

    profilesRepo.findOne
      .mockResolvedValueOnce(target)      // find target profile
      .mockResolvedValueOnce(oldDefault);  // find current default

    // Transaction callback: execute both writes
    dataSource.transaction.mockImplementation(
      async (cb: (m: unknown) => Promise<unknown>) => {
        const mockManager = {
                save: jest.fn().mockImplementation((entity: unknown) => entity as any),
          findOne: jest.fn().mockResolvedValue(oldDefault),
        };
        return cb(mockManager);
      },
    );

    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: nucleiSchema,
    });

    await service.setDefault(wsId, 'prof-new');

    // Verify the transaction was called
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    // The transaction callback ran inside service.setDefault.
    // Verify it by re-executing with a properly mocked manager.
    const txFn = dataSource.transaction.mock.calls[0][0];
    const mockManager = { save: jest.fn(), findOne: jest.fn().mockResolvedValue(oldDefault) };
    await txFn(mockManager);

    // Old default unset + new default set = 2 save calls
    expect(mockManager.save).toHaveBeenCalledTimes(2);
  });

  // ── DELETE ───────────────────────────────────────────────────────────

  it('delete removes profile unconditionally', async () => {
    const profile = mockProfile({ id: 'prof-001', config: {} });
    profilesRepo.findOne.mockResolvedValue(profile);
    profilesRepo.remove.mockImplementation((p) => p);

    await service.remove(wsId, 'prof-001');

    expect(profilesRepo.remove).toHaveBeenCalledWith(profile);
  });

  it('delete — profile not found throws', async () => {
    profilesRepo.findOne.mockResolvedValue(null);

    await expect(service.remove(wsId, 'prof-missing')).rejects.toThrow();
  });

  it('delete — findOwned loads workspace and tool relations before ownership check', async () => {
    const profile = mockProfile({ id: 'prof-001', config: {} });
    profilesRepo.findOne.mockResolvedValue(profile);
    profilesRepo.remove.mockImplementation((p) => p);

    await service.remove(wsId, 'prof-001');

    // findOwned() reads (profile.workspace).id — the workspace relation must
    // be eager-loaded too, or the real TypeORM entity (undefined relation)
    // crashes with TypeError on getOne/update/setDefault/remove.
    expect(profilesRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.arrayContaining(['workspace', 'tool']),
      }),
    );
  });

  // ── LIST ─────────────────────────────────────────────────────────────

  it('list returns masked profiles (secrets hidden)', async () => {
    const profile = mockProfile({
      id: 'prof-001',
      config: { apiKey: 'enc:abc123xyz', target: 'example.com' },
    });
    profilesRepo.find.mockResolvedValue([profile]);

    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: schemaWithPassword,
    });

    const result = await service.list(wsId, toolId);

    expect(result).toHaveLength(1);
    // apiKey should be masked, target should be plain
    const cfg = result[0].config;
    expect(cfg.apiKey).toMatch(/^\*\*\*\*/);
    expect(cfg.target).toBe('example.com');
  });

  // ── GET ONE ──────────────────────────────────────────────────────────

  it('get returns masked profile', async () => {
    const profile = mockProfile({
      id: 'prof-001',
      config: { apiKey: 'enc:secret', target: 't.com' },
    });
    profilesRepo.findOne.mockResolvedValue(profile);
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: schemaWithPassword,
    });

    const result = await service.getOne(wsId, 'prof-001');

    expect(result).toBeDefined();
    const cfg = (result).config;
    expect(cfg.apiKey).toMatch(/^\*\*\*\*/);
    expect(cfg.target).toBe('t.com');
  });

  it('getOne loads tool relation for masking', async () => {
    const profile = mockProfile({
      id: 'prof-001',
      config: { apiKey: 'enc:secret', target: 't.com' },
    });
    profilesRepo.findOne.mockResolvedValue(profile);
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: schemaWithPassword,
    });

    await service.getOne(wsId, 'prof-001');

    // Verify findOne (via findOwned) was called with workspace + tool relations
    expect(profilesRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.arrayContaining(['workspace', 'tool']),
      }),
    );
  });

  // ── LIST: relation loading (regression: unloaded tool → TypeError) ──

  it('list — loads tool relation for masking', async () => {
    profilesRepo.find.mockResolvedValue([]);

    await service.list(wsId, toolId);

    // Regression guard: maskConfig() dereferences (profile.tool).name, so the
    // find must eager-load the tool relation or it crashes with TypeError.
    expect(profilesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.arrayContaining(['tool']),
      }),
    );
  });

  it('list — profile with unloaded tool relation does not throw and returns unchanged', async () => {
    // Simulates the real TypeORM shape when relations are NOT loaded:
    // profile.tool is undefined, not a Tool object.
    const profile = mockProfile({
      tool: undefined as unknown as Tool,
      config: { apiKey: 'supersecretvalue', target: 'x.com' },
    });
    profilesRepo.find.mockResolvedValue([profile]);

    const result = await service.list(wsId, toolId);

    // Must NOT throw; entity passes through unmasked (no schema to consult)
    expect(result).toEqual([profile]);
    expect(connectorRegistry.getConnector).not.toHaveBeenCalled();
  });

  // ── DISPATCH ─────────────────────────────────────────────────────────

  it('resolveConfigForDispatch — loads workspace+tool relations and returns decrypted config', async () => {
    const encrypted = encryptProfile(
      { apiKey: 'secret123', target: 'x.com' },
      ['apiKey'],
      Buffer.alloc(32),
    );
    const profile = mockProfile({
      id: 'prof-001',
      tool: { id: toolId, name: 'nuclei' } as Tool,
      workspace: { id: wsId },
      config: encrypted,
      isDefault: true,
    });
    profilesRepo.findOne.mockResolvedValue(profile);
    toolsRepo.findOne.mockResolvedValue(mockTool);
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: schemaWithPassword,
    });

    const result = await service.resolveConfigForDispatch(
      wsId,
      toolId,
      'prof-001',
    );

    // Explicit-profile branch reads (profile.workspace).id and (profile.tool).id,
    // so findOne must eager-load both relations.
    expect(profilesRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.arrayContaining(['workspace', 'tool']),
      }),
    );
    expect(result).toEqual({ apiKey: 'secret123', target: 'x.com' });
  });

  // ── SECURITY INVARIANT ───────────────────────────────────────────────

  it('secret never appears plain in any returned object', async () => {
    const profile = mockProfile({
      id: 'prof-001',
      config: { apiKey: 'supersecretvalue', target: 'x.com' },
    });
    profilesRepo.find.mockResolvedValue([profile]);
    profilesRepo.findOne.mockResolvedValue(profile);

    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: schemaWithPassword,
    });

    const listResult = await service.list(wsId, toolId);
    for (const p of listResult) {
      const cfg = p.config;
      expect(cfg.apiKey).not.toBe('supersecretvalue');
    }

    const getResult = await service.getOne(wsId, 'prof-001');
    const cfg = (getResult).config;
    expect(cfg.apiKey).not.toBe('supersecretvalue');
  });

  // ── MASK FORMAT ──────────────────────────────────────────────────────

  it('mask format is ****last4', async () => {
    const profile = mockProfile({
      config: { apiKey: 'abcdef123456', target: 'x.com' },
    });
    profilesRepo.find.mockResolvedValue([profile]);
    (connectorRegistry.getConnector as jest.Mock).mockReturnValue({
      name: 'nuclei', slug: 'nuclei', configSchema: schemaWithPassword,
    });

    const result = await service.list(wsId, toolId);
    const cfg = result[0].config;
    expect(cfg.apiKey).toBe('****3456');
  });
});
