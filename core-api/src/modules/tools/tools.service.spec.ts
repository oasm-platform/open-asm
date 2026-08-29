import { WorkerType } from '@/common/enums/enum';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import type { Tool } from './entities/tools.entity';
import type { ToolConfigProfile } from './entities/tool-config-profiles.entity';
import type { WorkspaceTool } from './entities/workspace_tools.entity';
import { ToolsService } from './tools.service';

// ── Mock factories ──────────────────────────────────────────────────
const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn().mockResolvedValue(undefined),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
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

// ── Tests ───────────────────────────────────────────────────────────
describe('ToolsService — readiness flags', () => {
  let service: ToolsService;
  let toolsRepo: ReturnType<typeof mockRepo>;
  let workspaceToolRepo: ReturnType<typeof mockRepo>;
  let profilesRepo: ReturnType<typeof mockRepo>;
  let redisLockService: { withLock: jest.Mock };
  let storageService: { uploadFile: jest.Mock };
  let workersService: ReturnType<typeof mockWorkersService>;
  let connectorRegistry: Record<string, jest.Mock>;

  beforeEach(() => {
    toolsRepo = mockRepo();
    workspaceToolRepo = mockRepo();
    profilesRepo = mockRepo();
    redisLockService = {
      withLock: jest.fn((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
    };
    storageService = { uploadFile: jest.fn().mockResolvedValue(undefined) };
    workersService = mockWorkersService();
    connectorRegistry = {
      getConnector: jest.fn(),
      getEffectiveSchema: jest.fn(),
      getAllConnectors: jest.fn(),
    };

    service = new ToolsService(
      toolsRepo as unknown as Repository<Tool>,
      workspaceToolRepo as unknown as Repository<WorkspaceTool>,
      {} as any, // assetRepo
      {} as any, // vulnerabilityRepo
      workersService as any,
      redisLockService as any,
      storageService as any,
      profilesRepo as unknown as Repository<ToolConfigProfile>,
      connectorRegistry as any,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('hasProfile helper', () => {
    it('should return true when profile exists for workspace+tool', async () => {
      profilesRepo.findOne.mockResolvedValue({ id: 'prof-1' });

      const result = await service.hasProfile('ws-001', 'tool-001');

      expect(result).toBe(true);
      expect(profilesRepo.findOne).toHaveBeenCalledWith({
        where: {
          workspace: { id: 'ws-001' },
          tool: { id: 'tool-001' },
        },
      });
    });

    it('should return false when no profile exists', async () => {
      profilesRepo.findOne.mockResolvedValue(null);

      const result = await service.hasProfile('ws-001', 'tool-001');

      expect(result).toBe(false);
    });
  });

  describe('getManyTools — hasConfigProfile and isReady', () => {
    it('should include hasConfigProfile=true for connector tool with profile', async () => {
      const connectorTool = makeTool({ id: 'tool-1', name: 'nuclei' });
      toolsRepo.findAndCount.mockResolvedValue([[connectorTool], 1]);
      workspaceToolRepo.find.mockResolvedValue([{ tool: connectorTool, isEnabled: true }]);
      profilesRepo.find.mockResolvedValue([{ id: 'prof-1', tool: { id: 'tool-1' } }]); // batched profile lookup
      workersService.repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      });

      const result = await service.getManyTools({
        page: 1, limit: 10, workspaceId: 'ws-001',
      } as any);

      const tool = result.data[0] as any;
      expect(tool.hasConfigProfile).toBe(true);
      expect(tool.isReady).toBe(true);
    });

    it('should include hasConfigProfile=false for connector tool without profile', async () => {
      const connectorTool = makeTool({ id: 'tool-2', name: 'wpscan' });
      toolsRepo.findAndCount.mockResolvedValue([[connectorTool], 1]);
      workspaceToolRepo.find.mockResolvedValue([{ tool: connectorTool, isEnabled: true }]);
      profilesRepo.find.mockResolvedValue([]); // no profile
      workersService.repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      });

      const result = await service.getManyTools({
        page: 1, limit: 10, workspaceId: 'ws-001',
      } as any);

      const tool = result.data[0] as any;
      expect(tool.hasConfigProfile).toBe(false);
      expect(tool.isReady).toBe(false);
    });

    it('should include isReady=true for built-in tool (always ready)', async () => {
      const builtInTool = makeTool({
        id: 'tool-3', name: 'subfinder', type: WorkerType.BUILT_IN, isBuiltIn: true,
      });
      toolsRepo.findAndCount.mockResolvedValue([[builtInTool], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      workersService.repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      });

      const result = await service.getManyTools({
        page: 1, limit: 10, workspaceId: 'ws-001',
      } as any);

      const tool = result.data[0] as any;
      expect(tool.hasConfigProfile).toBeUndefined();
      expect(tool.isReady).toBe(true);
    });
  });

  describe('getInstalledTools — hasConfigProfile and isReady', () => {
    it('should include hasConfigProfile for installed connector tools', async () => {
      const connectorTool = makeTool({ id: 'tool-1', name: 'nuclei' });
      toolsRepo.find
        .mockResolvedValueOnce([]);  // builtInTools
      workspaceToolRepo.find
        .mockResolvedValueOnce([{ tool: connectorTool }]); // workspaceTools
      profilesRepo.find.mockResolvedValue([{ id: 'prof-1', tool: { id: 'tool-1' } }]); // batched profile lookup

      const result = await service.getInstalledTools(
        {}, 'ws-001',
      );

      const tool = result.data[0] as any;
      expect(tool.hasConfigProfile).toBe(true);
      expect(tool.isReady).toBe(true);
    });

    it('should include hasConfigProfile=false for connector without profile', async () => {
      const connectorTool = makeTool({ id: 'tool-2', name: 'wpscan' });
      toolsRepo.find
        .mockResolvedValueOnce([]);  // builtInTools
      workspaceToolRepo.find
        .mockResolvedValueOnce([{ tool: connectorTool }]); // workspaceTools
      profilesRepo.find.mockResolvedValue([]); // no profile

      const result = await service.getInstalledTools(
        {}, 'ws-001',
      );

      const tool = result.data[0] as any;
      expect(tool.hasConfigProfile).toBe(false);
      expect(tool.isReady).toBe(false);
    });

    it('should always include isReady=true for built-in tools', async () => {
      const builtInTool = makeTool({
        id: 'tool-3', name: 'subfinder', type: WorkerType.BUILT_IN, isBuiltIn: true,
      });
      toolsRepo.find
        .mockResolvedValueOnce([builtInTool]);  // builtInTools
      workspaceToolRepo.find
        .mockResolvedValueOnce([]); // workspaceTools

      const result = await service.getInstalledTools(
        {}, 'ws-001',
      );

      const tool = result.data[0] as any;
      expect(tool.hasConfigProfile).toBeUndefined();
      expect(tool.isReady).toBe(true);
    });
  });

  describe('getToolById — hasConfigProfile and isReady', () => {
    it('should include hasConfigProfile=true for connector with profile', async () => {
      const connectorTool = makeTool({ id: 'tool-1', name: 'nuclei' });
      toolsRepo.findOne.mockResolvedValue(connectorTool);
      workspaceToolRepo.findOne.mockResolvedValue({ tool: connectorTool });
      profilesRepo.findOne.mockResolvedValue({ id: 'prof-1' });

      const result = await service.getToolById('tool-1', 'ws-001');

      expect((result as any).hasConfigProfile).toBe(true);
      expect((result as any).isReady).toBe(true);
    });

    it('should include hasConfigProfile=false for connector without profile', async () => {
      const connectorTool = makeTool({ id: 'tool-2', name: 'wpscan' });
      toolsRepo.findOne.mockResolvedValue(connectorTool);
      workspaceToolRepo.findOne.mockResolvedValue({ tool: connectorTool });
      profilesRepo.findOne.mockResolvedValue(null);

      const result = await service.getToolById('tool-2', 'ws-001');

      expect((result as any).hasConfigProfile).toBe(false);
      expect((result as any).isReady).toBe(false);
    });

    it('should always include isReady=true for built-in tool', async () => {
      const builtInTool = makeTool({
        id: 'tool-3', name: 'subfinder', type: WorkerType.BUILT_IN, isBuiltIn: true,
      });
      toolsRepo.findOne.mockResolvedValue(builtInTool);

      const result = await service.getToolById('tool-3', 'ws-001');

      expect((result as any).hasConfigProfile).toBeUndefined();
      expect((result as any).isReady).toBe(true);
    });

    it('should return tool with hasConfigProfile even without workspaceId (connector)', async () => {
      const connectorTool = makeTool({ id: 'tool-1', name: 'nuclei' });
      toolsRepo.findOne.mockResolvedValue(connectorTool);

      const result = await service.getToolById('tool-1');

      // Without workspaceId, hasProfile is null (unknown)
      expect((result as any).hasConfigProfile).toBeNull();
      expect((result as any).isReady).toBe(false);
    });
  });

  describe('ToolsService construction — required deps (#9)', () => {
    it('ToolsService constructs with required deps (no optional markers)', () => {
      const instance = new ToolsService(
        toolsRepo as unknown as Repository<Tool>,
        workspaceToolRepo as unknown as Repository<WorkspaceTool>,
        {} as any,
        {} as any,
        workersService as any,
        redisLockService as any,
        storageService as any,
        profilesRepo as unknown as Repository<ToolConfigProfile>,
        connectorRegistry as any,
      );
      expect(instance).toBeDefined();
    });
  });

  describe('ToolsService — batched profile lookup (#4)', () => {
    const mockWorkerCount = () => {
      workersService.repo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });
    };

    it('getManyTools batches profile lookup across tools', async () => {
      const tool1 = makeTool({ id: 'tool-1', name: 'nuclei' });
      const tool2 = makeTool({ id: 'tool-2', name: 'wpscan' });
      toolsRepo.findAndCount.mockResolvedValue([[tool1, tool2], 2]);
      workspaceToolRepo.find.mockResolvedValue([
        { tool: tool1, isEnabled: true },
        { tool: tool2, isEnabled: true },
      ]);
      // Only tool-1 has a profile row
      profilesRepo.find.mockResolvedValue([
        { id: 'prof-1', tool: { id: 'tool-1' } },
      ]);
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1,
        limit: 10,
        workspaceId: 'ws-001',
      } as any);

      // Exactly ONE profile query for both tools (In-operator)
      expect(profilesRepo.find).toHaveBeenCalledTimes(1);
      const findArg = (profilesRepo.find).mock.calls[0][0];
      const ids = [...(findArg.where.tool.id)._value].sort();
      expect(ids).toEqual(['tool-1', 'tool-2']);

      const byId = new Map(
        (result.data as Array<Record<string, unknown>>).map((t) => [t.id, t]),
      );
      expect(byId.get('tool-1')?.hasConfigProfile).toBe(true);
      expect(byId.get('tool-2')?.hasConfigProfile).toBe(false);
    });

    it('getInstalledTools batches profile lookup across tools', async () => {
      const tool1 = makeTool({ id: 'tool-1', name: 'nuclei' });
      const tool2 = makeTool({ id: 'tool-2', name: 'wpscan' });
      toolsRepo.find.mockResolvedValueOnce([]); // builtInTools
      workspaceToolRepo.find.mockResolvedValueOnce([{ tool: tool1 }, { tool: tool2 }]);
      profilesRepo.find.mockResolvedValue([
        { id: 'prof-1', tool: { id: 'tool-1' } },
      ]);

      const result = await service.getInstalledTools({}, 'ws-001');

      expect(profilesRepo.find).toHaveBeenCalledTimes(1);
      const findArg = (profilesRepo.find).mock.calls[0][0];
      const ids = [...(findArg.where.tool.id)._value].sort();
      expect(ids).toEqual(['tool-1', 'tool-2']);

      const byId = new Map(
        (result.data as Array<Record<string, unknown>>).map((t) => [t.id, t]),
      );
      expect(byId.get('tool-1')?.hasConfigProfile).toBe(true);
      expect(byId.get('tool-2')?.hasConfigProfile).toBe(false);
    });

    it('getManyTools skips profile lookup for empty list', async () => {
      const builtInTool = makeTool({
        id: 'tool-3',
        name: 'subfinder',
        type: WorkerType.BUILT_IN,
        isBuiltIn: true,
      });
      toolsRepo.findAndCount.mockResolvedValue([[builtInTool], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1,
        limit: 10,
        workspaceId: 'ws-001',
      } as any);

      expect(profilesRepo.find).not.toHaveBeenCalled();
      expect((result.data[0] as any).isReady).toBe(true);
    });

    it('hasProfile single lookup unchanged', async () => {
      profilesRepo.findOne.mockResolvedValue({ id: 'prof-1' });
      const withProfile = await service.hasProfile('ws-001', 'tool-001');
      expect(withProfile).toBe(true);
      expect(profilesRepo.findOne).toHaveBeenCalledWith({
        where: {
          workspace: { id: 'ws-001' },
          tool: { id: 'tool-001' },
        },
      });

      profilesRepo.findOne.mockResolvedValue(null);
      const withoutProfile = await service.hasProfile('ws-001', 'tool-002');
      expect(withoutProfile).toBe(false);
    });
  });
});
