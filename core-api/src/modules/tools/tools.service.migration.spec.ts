import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { JobPriority, ToolCategory, WorkerType } from '@/common/enums/enum';
import type { Repository } from 'typeorm';
import type { Tool } from './entities/tools.entity';
import type { WorkspaceTool } from './entities/workspace_tools.entity';
import { ToolsService } from './tools.service';

// ── Mock factories ──────────────────────────────────────────────────────
const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn().mockResolvedValue(undefined),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  manager: { query: jest.fn().mockResolvedValue(undefined) },
});

const mockWorkersService = () => ({
  repo: {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    }),
    manager: { query: jest.fn().mockResolvedValue(undefined) },
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────
const makeTool = (overrides: Partial<Tool> & { name: string }): Tool => ({
  id: randomUUID(),
  description: '',
  version: '',
  logoUrl: '',
  isBuiltIn: false,
  isOfficialSupport: false,
  type: WorkerType.CONNECTOR,
  priority: 'medium' as any,
  category: 'vulnerabilities' as any,
  ...overrides,
});

/** Build fake QueryBuilder that records execute() and values() calls */
const fakeQB = () => {
  const qb = {
    insert: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  return qb;
};

// ── Manifest fixtures ──────────────────────────────────────────────────
const manifestNucleiAndNessus = JSON.stringify({
  connectors: [
    { slug: 'nuclei', name: 'Nuclei', version: '3.3.0', description: 'Nuclei template-based scanner', shortDescription: 'Fast scanner', capabilities: ['vulnerabilities'], logo: '' },
    { slug: 'nessus', name: 'Nessus', version: '10.8.0', description: 'Tenable Nessus vulnerability scanner', shortDescription: 'Tenable Nessus', capabilities: ['vulnerabilities'], logo: '' },
  ],
});

const manifestNucleiOnly = JSON.stringify({
  connectors: [
    { slug: 'nuclei', name: 'Nuclei', version: '3.3.0', description: 'Nuclei template-based scanner', capabilities: ['vulnerabilities'], logo: '' },
  ],
});

describe('ToolsService — legacy PROVIDER → CONNECTOR migration', () => {
  let service: ToolsService;
  let toolsRepo: ReturnType<typeof mockRepo>;
  let workspaceToolRepo: ReturnType<typeof mockRepo>;
  let redisLockService: { withLock: jest.Mock };
  let storageService: { uploadFile: jest.Mock };
  let workersService: ReturnType<typeof mockWorkersService>;
  let readFileSpy: jest.SpyInstance;

  // Shared mock state — updated per test
  let findResults: {
    builtIn: Tool[];
    connector: Tool[];
    providerByNames: Tool[];
    orphanProvider: Tool[];
    existingByName: Tool[];
  };

  beforeEach(() => {
    toolsRepo = mockRepo();
    workspaceToolRepo = mockRepo();
    redisLockService = {
      withLock: jest.fn((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
    };
    storageService = { uploadFile: jest.fn().mockResolvedValue(undefined) };
    workersService = mockWorkersService();

    findResults = {
      builtIn: [],          // tools found with type=BUILT_IN
      connector: [],        // tools found with type=CONNECTOR
      providerByNames: [],  // legacy: type=PROVIDER AND name IN
      orphanProvider: [],   // type=PROVIDER AND isOfficialSupport=true
      existingByName: [],   // any type, name In(allConnectorNames) — for new unique(name) logic
    };

    // Smart find mock: routes based on where clause
    toolsRepo.find.mockImplementation((opts: any) => {
      const where = opts?.where ?? {};
      if (where.type === WorkerType.BUILT_IN) return findResults.builtIn;
      if (where.type === WorkerType.CONNECTOR) return findResults.connector;
      if (where.type === WorkerType.PROVIDER && where.name) return findResults.providerByNames;
      if (where.isOfficialSupport === true) return findResults.orphanProvider;
      // New unique(name) logic: find where name In(...) without type
      if (where.name && !where.type && where.isOfficialSupport === undefined) {
        const names: string[] = where.name?.value ?? where.name?._value ?? [];
        const isBuiltInQuery = Array.isArray(names) && names.includes('subfinder');
        if (isBuiltInQuery) {
          // builtIn dedup query: where name In(builtInNames)
          return findResults.builtIn;
        }
        // connector override / dedup: where name In(allConnectorNames)
        if (findResults.existingByName.length > 0) return findResults.existingByName;
        // fallback for legacy path
        if (findResults.providerByNames.length) return findResults.providerByNames;
        if (findResults.connector.length) return findResults.connector;
        return [];
      }
      return [];
    });

    // createQueryBuilder returns a shared fake QB
    const qb = fakeQB();
    toolsRepo.createQueryBuilder.mockReturnValue(qb as any);

    const wtQb = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    workspaceToolRepo.createQueryBuilder.mockReturnValue(wtQb as any);

    readFileSpy = jest.spyOn(fs, 'readFile').mockResolvedValue(manifestNucleiAndNessus);

    service = new ToolsService(
      toolsRepo as unknown as Repository<Tool>,
      workspaceToolRepo as unknown as Repository<WorkspaceTool>,
      {} as any,
      {} as any,
      {} as any,
      workersService as any,
      redisLockService as any,
      storageService as any,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  // ── Scenario 1: Happy path — legacy PROVIDER taken over (unique(name) override) ──────
  describe('happy path: legacy PROVIDER → CONNECTOR takeover', () => {
    it('converts legacy PROVIDER nessus to CONNECTOR when manifest contains same slug', async () => {
      const legacyNessus = makeTool({
        id: 'legacy-nessus-id',
        name: 'nessus',
        type: WorkerType.PROVIDER,
        isOfficialSupport: true,
        description: 'Old Nessus description',
        logoUrl: '/static/images/nessus.png',
        version: '',
        priority: 'low' as any,
      });

      findResults.existingByName = [legacyNessus];
      findResults.providerByNames = [legacyNessus];

      const qb = fakeQB();
      toolsRepo.createQueryBuilder.mockReturnValue(qb as any);

      await service.onModuleInit();

      // 1) Legacy nessus was UPDATE IN PLACE to CONNECTOR via repository.save
      const saveCall = toolsRepo.save.mock.calls.find(
        (c: any[]) => c[0]?.name === 'nessus',
      );
      expect(saveCall).toBeDefined();
      const saved = saveCall[0] as Tool;
      expect(saved.type).toBe(WorkerType.CONNECTOR);
      expect(saved.isOfficialSupport).toBe(false);
      expect(saved.isBuiltIn).toBe(false);
      expect(saved.description).toContain('Nessus');
      expect(saved.version).toBe('10.8.0');
      expect(saved.logoUrl).toBe('/connectors/nessus.png');

      // 2) nessus was removed from toUpsert — only nuclei inserted in connector upsert (calls[1])
      // calls[0] is built-in upsert, calls[1] is connector upsert
      expect(qb.values.mock.calls.length).toBeGreaterThanOrEqual(2);
      const connectorUpsertValues = qb.values.mock.calls[1]?.[0] as any[] | undefined;
      expect(connectorUpsertValues).toBeDefined();
      const upsertNames: string[] = connectorUpsertValues!.map((v: Record<string, string>) => v.name);
      expect(upsertNames).not.toContain('nessus');
      expect(upsertNames).toContain('nuclei');

      // 3) Logo not uploaded (empty logo in manifest fixture — upload only when base64 present)
      expect(storageService.uploadFile).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 2: Duplicate — both PROVIDER + CONNECTOR exist ──────────
  describe('edge: both PROVIDER and CONNECTOR exist for same slug', () => {
    it('merges FKs, deletes legacy PROVIDER, keeps single CONNECTOR', async () => {
      const legacyNessus = makeTool({
        id: 'legacy-nessus-id',
        name: 'nessus',
        type: WorkerType.PROVIDER,
        isOfficialSupport: true,
        description: 'Legacy Nessus',
      });

      const existingConnectorNessus = makeTool({
        id: 'connector-nessus-id',
        name: 'nessus',
        type: WorkerType.CONNECTOR,
        description: 'Tenable Nessus vulnerability scanner',
        version: '10.8.0',
        logoUrl: '/connectors/nessus.png',
        category: ToolCategory.VULNERABILITIES,
        priority: JobPriority.MEDIUM,
      });

      const nucleiConnector = makeTool({
        name: 'nuclei',
        type: WorkerType.CONNECTOR,
        description: 'Nuclei template-based scanner',
        version: '3.3.0',
        logoUrl: '/connectors/nuclei.png',
        category: ToolCategory.VULNERABILITIES,
        priority: JobPriority.MEDIUM,
      });

      // For unique(name) dedup, existingByName contains both rows with same name
      findResults.existingByName = [legacyNessus, existingConnectorNessus, nucleiConnector];
      findResults.connector = [existingConnectorNessus, nucleiConnector];
      findResults.providerByNames = [legacyNessus];

      const qb = fakeQB();
      toolsRepo.createQueryBuilder.mockReturnValue(qb as any);
      toolsRepo.delete.mockResolvedValue(undefined);

      // Reset manager.query mocks for FK migration
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      (workspaceToolRepo.manager.query as jest.Mock).mockClear();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      (workersService.repo.manager.query as jest.Mock).mockClear();

      await service.onModuleInit();

      // 1) FK migration via manager.query: workspace_tools + workers (dedup keeps connector)
      expect(workspaceToolRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('workspace_tools'),
        expect.arrayContaining(['connector-nessus-id', 'legacy-nessus-id']),
      );
      expect(workersService.repo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('workers'),
        expect.arrayContaining(['connector-nessus-id', 'legacy-nessus-id']),
      );

      // 2) Legacy PROVIDER row deleted (dedup)
      expect(toolsRepo.delete).toHaveBeenCalledWith('legacy-nessus-id');

      // 3) No duplicate insert for nessus — connector upsert (calls[1]) should not contain nessus if no version change,
      //    or if it does, it should be an update not a duplicate. Since needsUpdate is false, no upsert should happen.
      // Built-in insert is calls[0]; connector insert is calls[1] if any.
      const connectorUpsertValues = qb.values.mock.calls[1]?.[0] as any[] | undefined;
      if (connectorUpsertValues) {
        const names: string[] = connectorUpsertValues.map((v: Record<string, string>) => v.name);
        // If there is an upsert, nessus should not be duplicated as new insert when no changes
        // Allow nessus only if it was an update due to needsUpdate
        expect(names).not.toContain('nessus');
      } else {
        // No connector upsert is also valid when nothing changed
        expect(qb.values.mock.calls.length).toBe(1); // only built-in
      }
    });
  });

  // ── Scenario 3: Orphan — legacy PROVIDER not in manifest ─────────────
  describe('edge: legacy PROVIDER not in manifest → orphan cleanup', () => {
    it('deletes orphaned PROVIDER tools and their workspace_tools', async () => {
      readFileSpy.mockResolvedValue(manifestNucleiOnly);

      const legacyNessus = makeTool({
        id: 'orphan-nessus-id',
        name: 'nessus',
        type: WorkerType.PROVIDER,
        isOfficialSupport: true,
      });

      // No manifest match for nessus → no override
      findResults.existingByName = [];
      findResults.providerByNames = [];
      // Orphan cleanup finds it
      findResults.orphanProvider = [legacyNessus];

      const qb = fakeQB();
      toolsRepo.createQueryBuilder.mockReturnValue(qb as any);
      toolsRepo.delete.mockResolvedValue(undefined);

      const wtQb = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      workspaceToolRepo.createQueryBuilder.mockReturnValue(wtQb as any);

      await service.onModuleInit();

      // 1) workspace_tools for orphan deleted
      expect(wtQb.execute).toHaveBeenCalled();

      // 2) Orphan tool deleted — robust check without relying on private _value
      expect(toolsRepo.delete).toHaveBeenCalled();
      const deleteArg = toolsRepo.delete.mock.calls[0]?.[0];
      expect(deleteArg?.id).toBeDefined();
      const operatorValue = deleteArg.id?.value ?? deleteArg.id?._value ?? [];
      expect(operatorValue).toEqual(expect.arrayContaining(['orphan-nessus-id']));
    });
  });

  // ── Scenario 4: Regression — built-in tools unaffected ───────────────
  describe('regression: built-in tools unchanged', () => {
    it('built-in tools upserted and orphan cleanup runs independently', async () => {
      readFileSpy.mockResolvedValue(manifestNucleiAndNessus);

      // No legacy providers, no orphans, no existing
      findResults.existingByName = [];
      findResults.providerByNames = [];
      findResults.orphanProvider = [];
      findResults.builtIn = [];
      findResults.connector = [];

      const qb = fakeQB();
      toolsRepo.createQueryBuilder.mockReturnValue(qb as any);

      await service.onModuleInit();

      // 1) builtInTools upserted first (nuclei no longer built-in)
      const builtInValues = qb.values.mock.calls[0]?.[0] as any[] | undefined;
      expect(builtInValues).toBeDefined();
      const builtInNames: string[] = builtInValues!.map((v: Record<string, string>) => v.name);
      expect(builtInNames).toContain('subfinder');
      expect(builtInNames).toContain('httpx');
      expect(builtInNames).toContain('screenshot');
      expect(builtInNames).toContain('naabu');
      expect(builtInNames).not.toContain('nuclei');
      // 1b) Connector from manifest upserted second
      const connectorValues = qb.values.mock.calls[1]?.[0] as any[] | undefined;
      expect(connectorValues).toBeDefined();
      const connectorNames: string[] = connectorValues!.map((v: Record<string, string>) => v.name);
      expect(connectorNames).toContain('nessus');

      // 2) removeOrphanBuiltInTools ran (find with type=BUILT_IN was called)
      expect(toolsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: WorkerType.BUILT_IN }) }),
      );
    });
  });
});
