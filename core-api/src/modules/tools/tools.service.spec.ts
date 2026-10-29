import { ToolCategory, WorkerType } from '@/common/enums/enum';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import { And, ILike, In, Not } from 'typeorm';
import type { Tool } from './entities/tools.entity';
import { ToolConfigProfile } from './entities/tool-config-profiles.entity';
import type { WorkspaceTool } from './entities/workspace_tools.entity';
import { ToolsService } from './tools.service';

// ── Mock factories ──────────────────────────────────────────────────
const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  save: jest.fn(),
  remove: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  manager: { query: jest.fn().mockResolvedValue(undefined) },
});

const mockWorkersService = () => ({
  repo: {
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getRawMany: jest.fn().mockResolvedValue([]),
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
  categories: [{ name: 'vulnerabilities', targetTypes: ['DOMAIN', 'IP', 'CIDR'] }] as any,
  ...overrides,
});

// ── Tests ───────────────────────────────────────────────────────────
describe('ToolsService — readiness flags', () => {
  let service: ToolsService;
  let toolsRepo: ReturnType<typeof mockRepo>;
  let workspaceToolRepo: ReturnType<typeof mockRepo>;
  let profilesRepo: ReturnType<typeof mockRepo>;
  let workersService: ReturnType<typeof mockWorkersService>;
  let connectorRegistry: Record<string, jest.Mock>;

  beforeEach(() => {
    toolsRepo = mockRepo();
    workspaceToolRepo = mockRepo();
    profilesRepo = mockRepo();
    workersService = mockWorkersService();
    connectorRegistry = {
      getConnector: jest.fn(),
      getConnectorSchema: jest.fn(),
      getEffectiveSchema: jest.fn(),
      getAllConnectors: jest.fn(),
    };

    service = new ToolsService(
      toolsRepo as unknown as Repository<Tool>,
      workspaceToolRepo as unknown as Repository<WorkspaceTool>,
      {} as any, // assetRepo
      {} as any, // vulnerabilityRepo
      workersService as any,
      profilesRepo,
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

    it('should include isReady=true for built-in tool (always ready)', async () => {
      const builtInTool = makeTool({
        id: 'tool-3', name: 'subfinder', type: WorkerType.BUILT_IN, isBuiltIn: true,
      });
      toolsRepo.findAndCount.mockResolvedValue([[builtInTool], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      workersService.repo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getManyTools({
        page: 1, limit: 10,
      } as any, 'ws-001');

      const tool = result.data[0] as any;
      expect(tool.hasConfigProfile).toBeUndefined();
      expect(tool.isReady).toBe(true);
    });
  });

  // ── Search tests ────────────────────────────────────────────────────
  const mockWorkerCount = () => {
    workersService.repo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getRawMany: jest.fn().mockResolvedValue([]),
    });
  };

  describe('getManyTools — search filter', () => {
    it('should return all tools when search is empty string', async () => {
      const tool = makeTool({ id: 't1', name: 'nuclei', description: 'vuln scanner' });
      toolsRepo.findAndCount.mockResolvedValue([[tool], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1, limit: 10, search: '',
      } as any, 'ws-001');

      expect(result.data).toHaveLength(1);
      // No ILike in where — plain findAndCount called
      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.where).toBeUndefined();
    });

    it('should filter tools by name match (case-insensitive)', async () => {
      const nuclei = makeTool({ id: 't1', name: 'nuclei', description: 'scan vulns' });
      toolsRepo.findAndCount.mockResolvedValue([[nuclei], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1, limit: 10, search: 'nucle',
      } as any, 'ws-001');

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      // The where should contain ILike conditions
      expect(callArg.where).toBeDefined();
      // findAndCount returns the filtered subset
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('nuclei');
    });

    it('should filter tools by description match', async () => {
      const tool = makeTool({
        id: 't1', name: 'subfinder',
        description: 'Find subdomains of websites',
      });
      toolsRepo.findAndCount.mockResolvedValue([[tool], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1, limit: 10, search: 'subdomain',
      } as any, 'ws-001');

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
      expect(result.data).toHaveLength(1);
    });

    it('should combine search with category filter', async () => {
      const tool = makeTool({ id: 't1', name: 'nuclei' });
      toolsRepo.findAndCount.mockResolvedValue([[tool], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1, limit: 10, search: 'nuclei', category: ToolCategory.VULNERABILITIES,
      } as any, 'ws-001');

      expect(result.data).toHaveLength(1);
      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
    });

    it('filters by category with a jsonb containment on categories', async () => {
      toolsRepo.findAndCount.mockResolvedValue([[], 0]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      await service.getManyTools({
        page: 1, limit: 10, category: ToolCategory.URL_DISCOVERY,
      } as any, 'ws-001');

      const where = toolsRepo.findAndCount.mock.calls[0][0].where;
      const branch = (Array.isArray(where) ? where[0] : where) as Record<string, any>;
      expect(branch).not.toHaveProperty('category');
      expect(branch.categories.getSql('"categories"')).toBe('"categories" @> :categoryFilter::jsonb');
      expect(branch.categories.objectLiteralParameters).toEqual({
        categoryFilter: JSON.stringify([{ name: 'url_discovery' }]),
      });
    });

    it('should combine search with type filter', async () => {
      const tool = makeTool({ id: 't1', name: 'nuclei', type: WorkerType.CONNECTOR });
      toolsRepo.findAndCount.mockResolvedValue([[tool], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1, limit: 10, search: 'nuclei', type: WorkerType.CONNECTOR,
      } as any, 'ws-001');

      expect(result.data).toHaveLength(1);
    });

    it('should return empty when search matches nothing', async () => {
      toolsRepo.findAndCount.mockResolvedValue([[], 0]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1, limit: 10, search: 'nonexistent',
      } as any, 'ws-001');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should trim whitespace from search input', async () => {
      toolsRepo.findAndCount.mockResolvedValue([[], 0]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      await service.getManyTools({
        page: 1, limit: 10, search: '   nuclei   ',
      } as any, 'ws-001');

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
    });

    it('should treat whitespace-only search as empty', async () => {
      const tool = makeTool({ id: 't1', name: 'nuclei' });
      toolsRepo.findAndCount.mockResolvedValue([[tool], 1]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      await service.getManyTools({
        page: 1, limit: 10, search: '   ',
      } as any, 'ws-001');

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      // whitespace-only → no search where clause
      expect(callArg.where).toBeUndefined();
    });

    it('should apply search in non-workspace path (no workspaceId)', async () => {
      const tool = makeTool({ id: 't1', name: 'nuclei' });
      toolsRepo.findAndCount.mockResolvedValue([[tool], 1]);

      const result = await service.getManyTools({
        page: 1, limit: 10, search: 'nuclei',
      } as any);

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getManyTools — sortBy / sortOrder', () => {
    it('should keep legacy default sort (name ASC) when sortBy is not overridden', async () => {
      toolsRepo.findAndCount.mockResolvedValue([[], 0]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      await service.getManyTools({
        page: 1, limit: 10,
      } as any, 'ws-001');

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.order).toEqual({ name: 'ASC' });
    });

    it('should respect custom sortBy and sortOrder', async () => {
      toolsRepo.findAndCount.mockResolvedValue([[], 0]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      await service.getManyTools({
        page: 1, limit: 10, sortBy: 'updatedAt', sortOrder: 'DESC',
      } as any, 'ws-001');

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.order).toEqual({ updatedAt: 'DESC' });
    });

    it('should fall back to legacy default for non-whitelisted sortBy', async () => {
      toolsRepo.findAndCount.mockResolvedValue([[], 0]);
      workspaceToolRepo.find.mockResolvedValue([]);
      mockWorkerCount();

      await service.getManyTools({
        page: 1, limit: 10, sortBy: 'passwordHash; DROP TABLE tools', sortOrder: 'DESC',
      } as any, 'ws-001');

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.order).toEqual({ name: 'ASC' });
    });

    it('should use default sort in non-workspace path', async () => {
      toolsRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getManyTools({
        page: 1, limit: 10,
      } as any);

      const callArg = toolsRepo.findAndCount.mock.calls[0][0];
      expect(callArg.order).toEqual({ name: 'ASC' });
    });
  });

  describe('getManyTools — agentTool filter', () => {
    beforeEach(() => {
      toolsRepo.findAndCount.mockResolvedValue([[], 0]);
      connectorRegistry.getAllConnectors.mockReturnValue([
        { slug: 'acunetix', agentTool: true },
        { slug: 'wpscan' },
      ]);
    });

    const whereFor = async (query: Record<string, unknown>) => {
      await service.getManyTools({ page: 1, limit: 10, ...query } as any);
      const [options] = toolsRepo.findAndCount.mock.calls[0] as [
        { where: unknown },
      ];
      return options.where;
    };

    it('agentTool=true matches built-ins OR manifest-flagged connectors', async () => {
      expect(await whereFor({ agentTool: true })).toEqual([
        { type: WorkerType.BUILT_IN },
        { name: In(['acunetix']) },
      ]);
    });

    it('agentTool=false excludes built-ins and manifest-flagged connectors', async () => {
      expect(await whereFor({ agentTool: false })).toEqual({
        type: Not(WorkerType.BUILT_IN),
        name: Not(In(['acunetix'])),
      });
    });

    it('agentTool=true keeps a non-built-in type filter intact', async () => {
      expect(
        await whereFor({ agentTool: true, type: WorkerType.CONNECTOR }),
      ).toEqual({ type: WorkerType.CONNECTOR, name: In(['acunetix']) });
    });

    it('agentTool=false with type=built_in matches nothing', async () => {
      expect(
        await whereFor({ agentTool: false, type: WorkerType.BUILT_IN }),
      ).toEqual({ type: WorkerType.BUILT_IN, id: In([]) });
    });

    it('combines with search, requiring both name constraints', async () => {
      expect(await whereFor({ agentTool: false, search: 'scan' })).toEqual([
        {
          type: Not(WorkerType.BUILT_IN),
          name: And(Not(In(['acunetix'])), ILike('%scan%')),
        },
        {
          type: Not(WorkerType.BUILT_IN),
          name: Not(In(['acunetix'])),
          description: ILike('%scan%'),
        },
      ]);
    });

    it('flags built-in tools as agentTool=true in the response', async () => {
      toolsRepo.findAndCount.mockResolvedValue([
        [
          makeTool({ id: 't1', name: 'subfinder', type: WorkerType.BUILT_IN }),
          makeTool({ id: 't2', name: 'wpscan' }),
        ],
        2,
      ]);
      connectorRegistry.getConnector.mockReturnValue(null);

      const result = await service.getManyTools({ page: 1, limit: 10 } as any);

      expect(result.data.map((t) => t.agentTool)).toEqual([true, false]);
    });
  });

  // ── End search tests ────────────────────────────────────────────────

  describe('getAgentTools — installed agent tools only', () => {
    beforeEach(() => {
      connectorRegistry.getConnector.mockImplementation((name: string) =>
        name === 'acunetix' || name === 'zap' ? { agentTool: true } : null,
      );
      connectorRegistry.getConnectorSchema.mockReturnValue(null);
    });

    const optionsFor = async (search?: string) => {
      await service.getAgentTools('ws-001', search);
      const [options] = toolsRepo.find.mock.calls[0] as [
        { where: unknown; order: unknown; take?: number },
      ];
      return options;
    };
    const whereFor = async (search?: string) =>
      (await optionsFor(search)).where;

    it('matches built-ins OR the agent connectors enabled in the workspace', async () => {
      workspaceToolRepo.find.mockResolvedValue([
        { tool: makeTool({ id: 'c1', name: 'acunetix' }) },
        { tool: makeTool({ id: 'c2', name: 'wpscan' }) }, // not an agent tool
        { tool: makeTool({ id: 'b1', name: 'subfinder', type: WorkerType.BUILT_IN }) },
      ]);

      expect(await whereFor()).toEqual([
        { type: WorkerType.BUILT_IN },
        { id: In(['c1']) },
      ]);
      expect(workspaceToolRepo.find).toHaveBeenCalledWith({
        where: { workspace: { id: 'ws-001' }, isEnabled: true },
        relations: ['tool'],
      });
    });

    it('leaves only built-ins when no agent connector is installed', async () => {
      workspaceToolRepo.find.mockResolvedValue([]);

      expect(await whereFor()).toEqual([
        { type: WorkerType.BUILT_IN },
        { id: In([]) },
      ]);
    });

    it('combines with search on name or description', async () => {
      workspaceToolRepo.find.mockResolvedValue([
        { tool: makeTool({ id: 'c1', name: 'acunetix' }) },
      ]);

      expect(await whereFor('scan')).toEqual([
        { type: WorkerType.BUILT_IN, name: ILike('%scan%') },
        { type: WorkerType.BUILT_IN, description: ILike('%scan%') },
        { id: In(['c1']), name: ILike('%scan%') },
        { id: In(['c1']), description: ILike('%scan%') },
      ]);
    });

    it('returns every match sorted by name, without paging', async () => {
      const options = await optionsFor();

      expect(options.order).toEqual({ name: 'ASC' });
      expect(options.take).toBeUndefined();
      expect(toolsRepo.findAndCount).not.toHaveBeenCalled();
    });

    it('returns a plain array flagged installed and agentTool, with config readiness', async () => {
      toolsRepo.find.mockResolvedValue([
        makeTool({ id: 'b1', name: 'subfinder', type: WorkerType.BUILT_IN }),
        makeTool({ id: 'c1', name: 'acunetix' }),
        makeTool({ id: 'c2', name: 'zap' }),
      ]);
      // acunetix needs config but has no profile; zap needs none.
      connectorRegistry.getConnectorSchema.mockImplementation((name: string) =>
        name === 'acunetix' ? { type: 'object' } : null,
      );
      profilesRepo.find.mockResolvedValue([]);

      const result = await service.getAgentTools('ws-001');

      expect(Array.isArray(result)).toBe(true);
      expect(
        result.map(({ name, isInstalled, agentTool, isReady }) => ({
          name,
          isInstalled,
          agentTool,
          isReady,
        })),
      ).toEqual([
        { name: 'subfinder', isInstalled: true, agentTool: true, isReady: true },
        { name: 'acunetix', isInstalled: true, agentTool: true, isReady: false },
        { name: 'zap', isInstalled: true, agentTool: true, isReady: true },
      ]);
    });
  });

  describe('getInstalledTools — hasConfigProfile and isReady', () => {
    it('marks every returned tool as installed for the console actions', async () => {
      const builtInTool = makeTool({
        id: 'tool-3', name: 'subfinder', type: WorkerType.BUILT_IN, isBuiltIn: true,
      });
      const connectorTool = makeTool({
        id: 'tool-1', name: 'nuclei', type: WorkerType.CONNECTOR,
      });
      toolsRepo.find.mockResolvedValueOnce([builtInTool]);
      workspaceToolRepo.find.mockResolvedValueOnce([{ tool: connectorTool }]);
      connectorRegistry.getConnectorSchema.mockReturnValue(null);

      const result = await service.getInstalledTools({}, 'ws-001');

      expect(result.data.map((tool) => tool.isInstalled)).toEqual([true, true]);
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
    it('should always include isReady=true for built-in tool', async () => {
      const builtInTool = makeTool({
        id: 'tool-3', name: 'subfinder', type: WorkerType.BUILT_IN, isBuiltIn: true,
      });
      toolsRepo.findOne.mockResolvedValue(builtInTool);

      const result = await service.getToolById('tool-3', 'ws-001');

      expect((result as any).hasConfigProfile).toBeUndefined();
      expect((result as any).isReady).toBe(true);
    });

    it('treats a disabled workspace tool as not installed and not ready', async () => {
      toolsRepo.findOne.mockResolvedValue(
        makeTool({ id: 't1', name: 'nuclei', type: WorkerType.CONNECTOR }),
      );
      workspaceToolRepo.findOne.mockResolvedValue({ id: 'wt1', isEnabled: false });
      profilesRepo.findOne.mockResolvedValue({ id: 'prof-1' });
      connectorRegistry.getConnectorSchema.mockReturnValue({ type: 'object' });

      const result = await service.getToolById('t1', 'ws-001');

      expect(result.isInstalled).toBe(false);
      expect(result.isReady).toBe(false);
    });

    it('treats an enabled workspace tool as installed', async () => {
      toolsRepo.findOne.mockResolvedValue(
        makeTool({ id: 't1', name: 'nuclei', type: WorkerType.CONNECTOR }),
      );
      workspaceToolRepo.findOne.mockResolvedValue({ id: 'wt1', isEnabled: true });
      connectorRegistry.getConnectorSchema.mockReturnValue(null);

      const result = await service.getToolById('t1', 'ws-001');

      expect(result.isInstalled).toBe(true);
      expect(result.isReady).toBe(true);
    });
  });

  describe('getToolSchema — schema endpoint semantics', () => {

    it('returns {schema:null, source:null} without throwing for built-in tool', async () => {
      const builtInTool = makeTool({
        id: 'tool-4', name: 'subfinder', type: WorkerType.BUILT_IN, isBuiltIn: true,
      });
      toolsRepo.findOne.mockResolvedValue(builtInTool);
      (connectorRegistry.getConnector).mockReturnValue(null);
      (connectorRegistry.getEffectiveSchema).mockReturnValue({
        schema: null,
        source: null,
      });

      const result = await service.getToolSchema('tool-4', 'ws-001');

      expect(result).toEqual({ schema: null, source: null });
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
        profilesRepo,
        connectorRegistry as any,
      );
      expect(instance).toBeDefined();
    });
  });

  describe('ToolsService — batched profile lookup (#4)', () => {
    const mockWorkerCount = () => {
      workersService.repo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
        getRawMany: jest.fn().mockResolvedValue([]),
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
      // nuclei has a schema; wpscan (known connector) has none
      (connectorRegistry.getConnectorSchema).mockImplementation(
        (name: string) => (name === 'nuclei' ? { type: 'object' } : null),
      );
      mockWorkerCount();

      const result = await service.getManyTools({
        page: 1,
        limit: 10,
      } as any, 'ws-001');

      // Exactly ONE profile query for both tools (In-operator)
      expect(profilesRepo.find).toHaveBeenCalledTimes(1);
      const findArg = (profilesRepo.find).mock.calls[0][0];
      const ids = [...(findArg.where.tool.id)._value].sort();
      expect(ids).toEqual(['tool-1', 'tool-2']);

      const byId = new Map(
        (result.data as Array<Record<string, unknown>>).map((t) => [t.id, t]),
      );
      expect(byId.get('tool-1')?.hasConfigProfile).toBe(true);
      expect(byId.get('tool-1')?.isReady).toBe(true); // has profile
      expect(byId.get('tool-2')?.hasConfigProfile).toBe(false);
      expect(byId.get('tool-2')?.isReady).toBe(true); // no schema → no config needed
    });

    it('getInstalledTools batches profile lookup across tools', async () => {
      const tool1 = makeTool({ id: 'tool-1', name: 'nuclei' });
      const tool2 = makeTool({ id: 'tool-2', name: 'wpscan' });
      toolsRepo.find.mockResolvedValueOnce([]); // builtInTools
      workspaceToolRepo.find.mockResolvedValueOnce([{ tool: tool1 }, { tool: tool2 }]);
      profilesRepo.find.mockResolvedValue([
        { id: 'prof-1', tool: { id: 'tool-1' } },
      ]);
      (connectorRegistry.getConnectorSchema).mockImplementation(
        (name: string) => (name === 'nuclei' ? { type: 'object' } : null),
      );

      const result = await service.getInstalledTools({}, 'ws-001');

      expect(profilesRepo.find).toHaveBeenCalledTimes(1);
      const findArg = (profilesRepo.find).mock.calls[0][0];
      const ids = [...(findArg.where.tool.id)._value].sort();
      expect(ids).toEqual(['tool-1', 'tool-2']);

      const byId = new Map(
        (result.data as Array<Record<string, unknown>>).map((t) => [t.id, t]),
      );
      expect(byId.get('tool-1')?.hasConfigProfile).toBe(true);
      expect(byId.get('tool-1')?.isReady).toBe(true);
      expect(byId.get('tool-2')?.hasConfigProfile).toBe(false);
      expect(byId.get('tool-2')?.isReady).toBe(true); // no schema → ready
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
      } as any, 'ws-001');

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

describe('uninstallTool — cascades config profile deletion', () => {
  let service: ToolsService;
  let workspaceToolRepo: ReturnType<typeof mockRepo>;
  let profilesRepo: ReturnType<typeof mockRepo>;
  let txManager: { remove: jest.Mock; delete: jest.Mock };

  beforeEach(() => {
    workspaceToolRepo = mockRepo();
    profilesRepo = mockRepo();
    txManager = {
      remove: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    (workspaceToolRepo.manager as any).transaction = jest.fn(
      async (cb: (m: typeof txManager) => Promise<unknown>) => cb(txManager),
    );

    service = new ToolsService(
      mockRepo() as unknown as Repository<Tool>,
      workspaceToolRepo as unknown as Repository<WorkspaceTool>,
      {} as any, // assetRepo
      {} as any, // vulnerabilityRepo
      mockWorkersService() as any,
      profilesRepo,
      {} as any, // connectorRegistry
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('removes the workspace_tools row AND deletes config profiles for the (workspace, tool) pair', async () => {
    workspaceToolRepo.findOne.mockResolvedValue({ id: 'wt-1' });

    const result = await service.uninstallTool(
      { toolId: 'tool-001' },
      'ws-001',
    );

    expect(result).toEqual({ message: 'Tool uninstalled successfully.' });
    expect(workspaceToolRepo.findOne).toHaveBeenCalledWith({
      where: { tool: { id: 'tool-001' }, workspace: { id: 'ws-001' } },
    });
    expect(workspaceToolRepo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(txManager.remove).toHaveBeenCalledTimes(1);
    expect(txManager.delete).toHaveBeenCalledTimes(1);
    expect(txManager.delete).toHaveBeenCalledWith(ToolConfigProfile, {
      workspace: { id: 'ws-001' },
      tool: { id: 'tool-001' },
    });
    // atomicity: repo-level remove / profilesRepo.delete must not happen outside the transaction
    expect(workspaceToolRepo.remove).not.toHaveBeenCalled();
    expect(profilesRepo.delete).not.toHaveBeenCalled();
  });

  it('succeeds when the tool has NO config profiles (no-op profile delete, no throw)', async () => {
    workspaceToolRepo.findOne.mockResolvedValue({ id: 'wt-2' });

    const result = await service.uninstallTool(
      { toolId: 'tool-002' },
      'ws-002',
    );

    expect(result).toEqual({ message: 'Tool uninstalled successfully.' });
    expect(workspaceToolRepo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(txManager.delete).toHaveBeenCalledTimes(1);
    expect(txManager.delete).toHaveBeenCalledWith(ToolConfigProfile, {
      workspace: { id: 'ws-002' },
      tool: { id: 'tool-002' },
    });
  });

  it('throws BadRequestException and deletes nothing when the tool is not installed', async () => {
    workspaceToolRepo.findOne.mockResolvedValue(null);

    await expect(
      service.uninstallTool({ toolId: 'tool-003' }, 'ws-003'),
    ).rejects.toThrow(
      new BadRequestException('Tool is not installed in this workspace.'),
    );

    expect(workspaceToolRepo.manager.transaction).not.toHaveBeenCalled();
    expect(workspaceToolRepo.remove).not.toHaveBeenCalled();
    expect(txManager.delete).not.toHaveBeenCalled();
    expect(profilesRepo.delete).not.toHaveBeenCalled();
  });

  it('scopes the profile deletion to the uninstalled (workspace, tool) pair only', async () => {
    workspaceToolRepo.findOne.mockResolvedValue({ id: 'wt-4' });

    await service.uninstallTool({ toolId: 'tool-shared' }, 'ws-A');

    expect(txManager.delete).toHaveBeenCalledTimes(1);
    // criteria pins BOTH ids — profiles of the same tool in other workspaces are untouched
    expect(txManager.delete).toHaveBeenCalledWith(ToolConfigProfile, {
      workspace: { id: 'ws-A' },
      tool: { id: 'tool-shared' },
    });
  });
});
