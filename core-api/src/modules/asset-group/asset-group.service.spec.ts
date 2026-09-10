import { BullMQName, CronSchedule } from '@/common/enums/enum';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { ToolsService } from '../tools/tools.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import type { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { AssetGroupService } from './asset-group.service';
import { AssetGroupWorkflowService } from './asset-group-workflow.service';
import { AssetGroupAssetService } from './asset-group-asset.service';
import type { CreateAssetGroupDto } from './dto/create-asset-group.dto';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroup } from './entities/asset-groups.entity';
import type { GetAllAssetGroupsQueryDto } from './dto/get-all-asset-groups-dto.dto';

describe('AssetGroupService', () => {
  let service: AssetGroupService;

  const mockManager = {
    findOneBy: jest.fn(),
    find: jest.fn(),
  };

  const mockAssetGroupRepo = {
    manager: mockManager,
    findOne: jest.fn(),
    findByIds: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn<
      Record<string, unknown>,
      [data: Record<string, unknown>]
    >(),
    save: jest.fn<
      Promise<Record<string, unknown>>,
      [entity: Record<string, unknown>]
    >(),
    remove: jest.fn(),
  };

  const mockAssetGroupWorkflowRepo = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn<
      Record<string, unknown>,
      [data: Record<string, unknown>]
    >(),
    save: jest.fn<
      Promise<Record<string, unknown>[]>,
      [entities: Record<string, unknown>[]]
    >(),
  };

  const mockWorkflowRepo = {
    findByIds: jest.fn(),
    create: jest.fn<
      Record<string, unknown>,
      [data: Record<string, unknown>]
    >(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockScanScheduleQueue = {
    add: jest.fn(),
    removeJobScheduler: jest.fn(),
  };

  // Query builder chain mock for the asset group list query
  const createMockAssetGroupListBuilder = ({
    entities = [],
    raw = [],
    total = 0,
  }: {
    entities?: Record<string, unknown>[];
    raw?: Array<{ totalAssets: string; lastRunAt?: string | null }>;
    total?: number;
  } = {}) => {
    const builder = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
      getCount: jest.fn().mockResolvedValue(total),
    };
    return builder;
  };

  const mockToolsService = {
    getProfileToolIds: jest.fn().mockResolvedValue(new Set()),
  };

  const mockJobsRegistryService = {};

  const mockConnectorRegistryService = {
    getConnector: jest.fn(),
  };

  const mockEncryptionService = {
    getDEK: jest.fn(),
  };

  const mockWorkflowService = {
    addManyWorkflows: jest.fn(),
    removeManyWorkflows: jest.fn(),
    updateAssetGroupWorkflow: jest.fn(),
    runGroupWorkflowScheduler: jest.fn(),
    removeGroupWorkflowScheduler: jest.fn(),
    getLastRunForWorkflows: jest.fn(),
  };

  const mockAssetAssetService = {
    addManyAssets: jest.fn(),
    removeManyAssets: jest.fn(),
    getAssetsByAssetGroupsId: jest.fn(),
    getAssetsNotInAssetGroup: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: getRepositoryToken(AssetGroup), useValue: mockAssetGroupRepo },
        {
          provide: getRepositoryToken(AssetGroupWorkflow),
          useValue: mockAssetGroupWorkflowRepo,
        },
        { provide: getRepositoryToken(Workflow), useValue: mockWorkflowRepo },
        {
          provide: getQueueToken(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE),
          useValue: mockScanScheduleQueue,
        },
        { provide: ToolsService, useValue: mockToolsService },
        { provide: JobsRegistryService, useValue: mockJobsRegistryService },
        { provide: ConnectorRegistryService, useValue: mockConnectorRegistryService },
        { provide: WorkspaceEncryptionService, useValue: mockEncryptionService },
        { provide: AssetGroupWorkflowService, useValue: mockWorkflowService },
        { provide: AssetGroupAssetService, useValue: mockAssetAssetService },
        AssetGroupService,
      ],
    }).compile();

    service = module.get<AssetGroupService>(AssetGroupService);
  });

  describe('create', () => {
    const workspaceId = 'workspace-uuid';
    const groupId = 'group-1';

    const mockWorkspace = { id: workspaceId } as Workspace;

    beforeEach(() => {
      mockManager.findOneBy.mockResolvedValue(mockWorkspace);
      mockAssetGroupRepo.findOne.mockResolvedValue(undefined);
      mockAssetGroupRepo.create.mockImplementation((data) => ({
        id: groupId,
        ...data,
      }));
      mockAssetGroupRepo.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );
      mockAssetGroupWorkflowRepo.create.mockImplementation((data) => ({
        id: 'agw-1',
        ...data,
      }));
      mockAssetGroupWorkflowRepo.save.mockImplementation((entities) =>
        Promise.resolve(entities),
      );
    });

    it('should create a group with name only (existing behavior)', async () => {
      const dto = { name: 'Web Servers' } as CreateAssetGroupDto;

      const result = await service.create(dto, workspaceId);

      expect(mockAssetGroupRepo.create).toHaveBeenCalledWith({
        name: 'Web Servers',
        workspace: { id: workspaceId },
      });
      expect(result.id).toBe(groupId);
      expect(mockWorkflowRepo.save).not.toHaveBeenCalled();
      expect(mockScanScheduleQueue.add).not.toHaveBeenCalled();
    });

    it('should persist the hexColor passed at creation', async () => {
      const dto = {
        name: 'Web Servers',
        hexColor: '#3b82f6',
      } as CreateAssetGroupDto;

      const result = await service.create(dto, workspaceId);

      expect(mockAssetGroupRepo.create).toHaveBeenCalledWith({
        name: 'Web Servers',
        hexColor: '#3b82f6',
        workspace: { id: workspaceId },
      });
      expect(result.hexColor).toBe('#3b82f6');
    });

    it('should add assets, create a workflow from tools and delegate workflow assignment', async () => {
      const tools = [
        { id: 'tool-1', name: 'nmap' },
        { id: 'tool-2', name: 'gobuster' },
      ];
      const savedWorkflow = { id: 'workflow-1', name: `Group Workflow - ${groupId}` };
      const dto = {
        name: 'Web Servers',
        hostIds: ['asset-1', 'asset-2'],
        schedule: '0 0 * * *',
        toolIds: ['tool-1', 'tool-2'],
      } as CreateAssetGroupDto;

      mockAssetGroupRepo.findOne.mockResolvedValueOnce(undefined); // name check
      mockAssetAssetService.addManyAssets.mockResolvedValue({
        message: '2 assets successfully added',
      });
      mockManager.find.mockResolvedValue(tools);
      mockWorkflowRepo.create.mockImplementation((data) => data);
      mockWorkflowRepo.save.mockResolvedValue(savedWorkflow);
      mockWorkflowService.addManyWorkflows.mockResolvedValue({
        message: '1 workflows successfully added to asset group "group-1"',
      });

      const result = await service.create(dto, workspaceId);

      expect(result.id).toBe(groupId);

      // Assets delegated to AssetGroupAssetService
      expect(mockAssetAssetService.addManyAssets).toHaveBeenCalledWith(
        groupId,
        ['asset-1', 'asset-2'],
      );

      // Workflow created with one job per tool
      expect(mockWorkflowRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `Group Workflow - ${groupId}`,
          content: {
            on: { schedule: '0 0 * * *', target: [] },
            jobs: [
              { name: 'nmap', run: 'nmap' },
              { name: 'gobuster', run: 'gobuster' },
            ],
            name: `Group Workflow - ${groupId}`,
          },
          filePath: `group-${groupId}.yaml`,
          workspace: { id: workspaceId },
        }),
      );

      // Workflow assignment delegated to workflow service
      expect(mockWorkflowService.addManyWorkflows).toHaveBeenCalledWith(
        groupId,
        ['workflow-1'],
        '0 0 * * *',
      );
    });

    it('should default the workflow schedule to EVERY_3_DAYS when only toolIds are passed', async () => {
      const tools = [{ id: 'tool-1', name: 'nmap' }];
      const dto = {
        name: 'Web Servers',
        toolIds: ['tool-1'],
      } as CreateAssetGroupDto;

      mockAssetGroupRepo.findOne.mockResolvedValueOnce(undefined); // name check
      mockAssetGroupRepo.findOne.mockResolvedValue({ id: groupId });
      mockManager.find.mockResolvedValue(tools);
      mockWorkflowRepo.create.mockImplementation((data) => data);
      mockWorkflowRepo.save.mockResolvedValue({ id: 'workflow-1' });
      mockWorkflowService.addManyWorkflows.mockResolvedValue({
        message: '1 workflows successfully added to asset group "group-1"',
      });

      await service.create(dto, workspaceId);

      expect(mockWorkflowService.addManyWorkflows).toHaveBeenCalledWith(
        groupId,
        ['workflow-1'],
        CronSchedule.EVERY_3_DAYS,
      );
    });

    it('should throw BadRequestException when schedule is passed without toolIds', async () => {
      const dto = {
        name: 'Web Servers',
        schedule: '0 0 * * *',
      } as CreateAssetGroupDto;

      await expect(service.create(dto, workspaceId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockAssetGroupRepo.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when a tool does not exist', async () => {
      const dto = {
        name: 'Web Servers',
        toolIds: ['tool-1', 'tool-2'],
      } as CreateAssetGroupDto;

      mockAssetGroupRepo.findOne.mockResolvedValueOnce(undefined); // name check
      mockManager.find.mockResolvedValue([{ id: 'tool-1', name: 'nmap' }]);

      await expect(service.create(dto, workspaceId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockWorkflowRepo.save).not.toHaveBeenCalled();
    });

    // ── Connector profile validation ─────────────────────────────────
    it('should throw BadRequestException when connector tool lacks config profile', async () => {
      const connectorTool = {
        id: 'tool-connector',
        name: 'nuclei',
        type: 'connector',
        isBuiltIn: false,
      };
      const dto = {
        name: 'Web Servers',
        toolIds: ['tool-connector'],
      } as CreateAssetGroupDto;

      mockAssetGroupRepo.findOne.mockResolvedValueOnce(undefined); // name check
      mockManager.find.mockResolvedValue([connectorTool]);

      // Mock toolsService batched profile lookup to report no profile
      (mockToolsService as any).getProfileToolIds = jest
        .fn()
        .mockResolvedValue(new Set());

      await expect(service.create(dto, workspaceId)).rejects.toThrow(
        /requires a configuration profile/i,
      );
    });

    it('should allow connector tool with config profile', async () => {
      const connectorTool = {
        id: 'tool-connector',
        name: 'nuclei',
        type: 'connector',
        isBuiltIn: false,
      };
      const dto = {
        name: 'Web Servers',
        toolIds: ['tool-connector'],
      } as CreateAssetGroupDto;

      mockAssetGroupRepo.findOne.mockResolvedValueOnce(undefined); // name check
      mockAssetGroupRepo.findOne.mockResolvedValue({ id: groupId });
      mockManager.find.mockResolvedValue([connectorTool]);
      mockWorkflowRepo.create.mockImplementation((data) => data);
      mockWorkflowRepo.save.mockResolvedValue({ id: 'workflow-1' });
      mockWorkflowService.addManyWorkflows.mockResolvedValue({
        message: '1 workflows successfully added to asset group "group-1"',
      });

      // Mock toolsService batched profile lookup to report a profile
      (mockToolsService as any).getProfileToolIds = jest
        .fn()
        .mockResolvedValue(new Set(['tool-connector']));

      const result = await service.create(dto, workspaceId);
      expect(result.id).toBe(groupId);
    });

    it('should allow built-in tool without config profile', async () => {
      const builtInTool = {
        id: 'tool-builtin',
        name: 'subfinder',
        type: 'built_in',
        isBuiltIn: true,
      };
      const dto = {
        name: 'Web Servers',
        toolIds: ['tool-builtin'],
      } as CreateAssetGroupDto;

      mockAssetGroupRepo.findOne.mockResolvedValueOnce(undefined); // name check
      mockAssetGroupRepo.findOne.mockResolvedValue({ id: groupId });
      mockManager.find.mockResolvedValue([builtInTool]);
      mockWorkflowRepo.create.mockImplementation((data) => data);
      mockWorkflowRepo.save.mockResolvedValue({ id: 'workflow-1' });
      mockWorkflowService.addManyWorkflows.mockResolvedValue({
        message: '1 workflows successfully added to asset group "group-1"',
      });

      const result = await service.create(dto, workspaceId);
      expect(result.id).toBe(groupId);
    });

    it('should query config profiles once for multiple connector tools', async () => {
      const connectorA = { id: 'tool-a', name: 'nuclei', type: 'connector', isBuiltIn: false };
      const connectorB = { id: 'tool-b', name: 'wpscan', type: 'connector', isBuiltIn: false };
      const dto = {
        name: 'Web Servers',
        toolIds: ['tool-a', 'tool-b'],
      } as CreateAssetGroupDto;

      mockAssetGroupRepo.findOne.mockResolvedValueOnce(undefined); // name check
      mockAssetGroupRepo.findOne.mockResolvedValue({ id: groupId });
      mockManager.find.mockResolvedValue([connectorA, connectorB]);
      mockWorkflowRepo.create.mockImplementation((data) => data);
      mockWorkflowRepo.save.mockResolvedValue({ id: 'workflow-1' });
      mockWorkflowService.addManyWorkflows.mockResolvedValue({
        message: '1 workflows successfully added to asset group "group-1"',
      });
      (mockToolsService as any).getProfileToolIds = jest
        .fn()
        .mockResolvedValue(new Set(['tool-a', 'tool-b']));

      const result = await service.create(dto, workspaceId);
      expect(result.id).toBe(groupId);
      // Single batched profile lookup for both connector ids
      expect((mockToolsService as any).getProfileToolIds).toHaveBeenCalledTimes(1);
      expect((mockToolsService as any).getProfileToolIds).toHaveBeenCalledWith(
        workspaceId,
        ['tool-a', 'tool-b'],
      );
    });
  });

  describe('getAssetGroupById', () => {
    const workspaceId = 'workspace-uuid';
    const groupId = 'group-1';

    it('should return the asset group with its workflows embedded', async () => {
      const groupWithWorkflows = {
        id: groupId,
        name: 'Web Servers',
        assetGroupWorkflows: [
          {
            id: 'agw-1',
            schedule: '0 0 * * *',
            workflow: { id: 'wf-1', name: 'Group Workflow - group-1' },
          },
        ],
      };
      mockAssetGroupRepo.findOne.mockResolvedValue(groupWithWorkflows);
      mockWorkflowService.getLastRunForWorkflows.mockResolvedValue(new Map());

      const result = await service.getAssetGroupById(groupId, workspaceId);

      expect(mockAssetGroupRepo.findOne).toHaveBeenCalledWith({
        where: { id: groupId, workspace: { id: workspaceId } },
        relations: { assetGroupWorkflows: { workflow: true } },
      });
      expect(result.assetGroupWorkflows[0].workflow).toEqual({
        id: 'wf-1',
        name: 'Group Workflow - group-1',
      });
    });

    it('should attach the latest job history as lastRun on each workflow', async () => {
      const rawLastRun = {
        id: 'jh-1',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-01T10:30:00Z'),
        totalJobs: 3,
        status: 'COMPLETED',
        workflowName: 'Group Workflow - group-1',
        jobHistoryName: 'Group Workflow - group-1',
        jobRunType: 'MANUAL',
      };
      const lastRunMap = new Map([['wf-1', rawLastRun]]);
      mockWorkflowService.getLastRunForWorkflows.mockResolvedValue(lastRunMap);

      const groupWithWorkflows = {
        id: groupId,
        name: 'Web Servers',
        assetGroupWorkflows: [
          {
            id: 'agw-1',
            schedule: '0 0 * * *',
            workflow: { id: 'wf-1', name: 'Group Workflow - group-1' },
          },
        ],
      };
      mockAssetGroupRepo.findOne.mockResolvedValue(groupWithWorkflows);

      const result = await service.getAssetGroupById(groupId, workspaceId);

      expect(mockWorkflowService.getLastRunForWorkflows).toHaveBeenCalledWith(['wf-1']);
      expect(result.assetGroupWorkflows[0].lastRun).toEqual(rawLastRun);
    });

    it('should attach a distinct lastRun per workflow', async () => {
      const lastRunMap = new Map([
        ['wf-1', { id: 'jh-1', status: 'COMPLETED' }],
        ['wf-2', { id: 'jh-2', status: 'FAILED' }],
      ]);
      mockWorkflowService.getLastRunForWorkflows.mockResolvedValue(lastRunMap);

      mockAssetGroupRepo.findOne.mockResolvedValue({
        id: groupId,
        name: 'Web Servers',
        assetGroupWorkflows: [
          {
            id: 'agw-1',
            workflow: { id: 'wf-1' },
          },
          {
            id: 'agw-2',
            workflow: { id: 'wf-2' },
          },
        ],
      });

      const result = await service.getAssetGroupById(groupId, workspaceId);

      expect(result.assetGroupWorkflows[0].lastRun?.status).toBe('COMPLETED');
      expect(result.assetGroupWorkflows[1].lastRun?.status).toBe('FAILED');
    });

    it('should not query job history when the group has no workflows', async () => {
      mockAssetGroupRepo.findOne.mockResolvedValue({
        id: groupId,
        name: 'Web Servers',
        assetGroupWorkflows: [],
      });

      const result = await service.getAssetGroupById(groupId, workspaceId);

      expect(result.assetGroupWorkflows).toEqual([]);
      expect(mockWorkflowService.getLastRunForWorkflows).toHaveBeenCalledWith([]);
    });

    it('should set lastRun to null when no job history exists', async () => {
      mockWorkflowService.getLastRunForWorkflows.mockResolvedValue(new Map());

      mockAssetGroupRepo.findOne.mockResolvedValue({
        id: groupId,
        name: 'Web Servers',
        assetGroupWorkflows: [
          {
            id: 'agw-1',
            workflow: { id: 'wf-1' },
          },
        ],
      });

      const result = await service.getAssetGroupById(groupId, workspaceId);

      expect(result.assetGroupWorkflows[0].lastRun).toBeNull();
    });

    it('should set lastRun to null when the latest job history has no jobs (totalJobs = 0)', async () => {
      // Empty map means getLastRunForWorkflows skipped the row with totalJobs=0
      mockWorkflowService.getLastRunForWorkflows.mockResolvedValue(new Map());

      mockAssetGroupRepo.findOne.mockResolvedValue({
        id: groupId,
        name: 'Web Servers',
        assetGroupWorkflows: [
          {
            id: 'agw-1',
            workflow: { id: 'wf-1' },
          },
        ],
      });

      const result = await service.getAssetGroupById(groupId, workspaceId);

      expect(result.assetGroupWorkflows[0].lastRun).toBeNull();
    });

    it('should throw NotFoundException when the group does not belong to the workspace', async () => {
      mockAssetGroupRepo.findOne.mockResolvedValue(undefined);

      await expect(
        service.getAssetGroupById(groupId, workspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getManyAssetGroups', () => {
    const workspaceId = 'workspace-uuid';
    const groupId = 'group-1';
    const groupId2 = 'group-2';

    const listQuery = {
      page: 1,
      limit: 10,
      sortBy: 'name',
      sortOrder: 'ASC',
    } as GetAllAssetGroupsQueryDto;

    const lastRunAt = new Date('2026-08-01T10:00:00Z');
    const lastRunAt2 = new Date('2026-08-01T09:00:00Z');

    beforeEach(() => {
      mockAssetGroupRepo.createQueryBuilder.mockImplementation(() =>
        createMockAssetGroupListBuilder({
          entities: [{ id: groupId, name: 'Web Servers' }],
          raw: [{ totalAssets: '3', lastRunAt: lastRunAt.toISOString() }],
          total: 1,
        }),
      );
    });

    it('should return lastRunAt from the group workflows latest job history instead of embedding workflows', async () => {
      const result = await service.getManyAssetGroups(listQuery, workspaceId);

      expect(result.total).toBe(1);
      expect(result.data[0].totalAssets).toBe(3);
      expect(result.data[0].lastRunAt).toEqual(lastRunAt);
      expect(result.data[0]).not.toHaveProperty('assetGroupWorkflows');
    });

    it('should attach a distinct lastRunAt per group', async () => {
      mockAssetGroupRepo.createQueryBuilder.mockImplementation(() =>
        createMockAssetGroupListBuilder({
          entities: [
            { id: groupId, name: 'Web Servers' },
            { id: groupId2, name: 'Databases' },
          ],
          raw: [
            { totalAssets: '3', lastRunAt: lastRunAt.toISOString() },
            { totalAssets: '0', lastRunAt: lastRunAt2.toISOString() },
          ],
          total: 2,
        }),
      );

      const result = await service.getManyAssetGroups(listQuery, workspaceId);

      expect(result.data[0].lastRunAt).toEqual(lastRunAt);
      expect(result.data[1].lastRunAt).toEqual(lastRunAt2);
    });

    it('should set lastRunAt to null when the group workflows have no job history', async () => {
      mockAssetGroupRepo.createQueryBuilder.mockImplementation(() =>
        createMockAssetGroupListBuilder({
          entities: [{ id: groupId, name: 'Web Servers' }],
          raw: [{ totalAssets: '3', lastRunAt: null }],
          total: 1,
        }),
      );

      const result = await service.getManyAssetGroups(listQuery, workspaceId);

      expect(result.data[0].lastRunAt).toBeNull();
    });

    it('should not query anything else when the page has no groups', async () => {
      mockAssetGroupRepo.createQueryBuilder.mockImplementation(() =>
        createMockAssetGroupListBuilder({ entities: [], raw: [], total: 0 }),
      );

      const result = await service.getManyAssetGroups(listQuery, workspaceId);

      expect(result.data).toEqual([]);
    });

    it('should sort by the lastRunAt select alias when sortBy is lastRunAt', async () => {
      const builder = createMockAssetGroupListBuilder({
        entities: [{ id: groupId, name: 'Web Servers' }],
        raw: [{ totalAssets: '3', lastRunAt: lastRunAt.toISOString() }],
        total: 1,
      });
      mockAssetGroupRepo.createQueryBuilder.mockReturnValue(builder);

      const sortByLastRunAtQuery = {
        page: 1,
        limit: 10,
        sortBy: 'lastRunAt',
        sortOrder: SortOrder.DESC,
      } as GetAllAssetGroupsQueryDto;
      await service.getManyAssetGroups(sortByLastRunAtQuery, workspaceId);

      expect(builder.orderBy).toHaveBeenCalledWith('"lastRunAt"', 'DESC');
    });

    it('should keep sorting by entity columns for other sortBy values', async () => {
      const builder = createMockAssetGroupListBuilder({
        entities: [{ id: groupId, name: 'Web Servers' }],
        raw: [{ totalAssets: '3', lastRunAt: lastRunAt.toISOString() }],
        total: 1,
      });
      mockAssetGroupRepo.createQueryBuilder.mockReturnValue(builder);

      await service.getManyAssetGroups(listQuery, workspaceId);

      expect(builder.orderBy).toHaveBeenCalledWith('assetGroup.name', 'ASC');
    });
  });

  describe('delete', () => {
    const groupId = 'group-1';

    it('should cancel the schedulers and delete the group workflows so their job histories and jobs cascade', async () => {
      mockAssetGroupRepo.findOne.mockResolvedValue({
        id: groupId,
        name: 'Web Servers',
        assetGroupAssets: [{ id: 'aga-1' }],
        assetGroupWorkflows: [
          { id: 'agw-1', jobId: 'repeat-key-1', workflow: { id: 'wf-1' } },
          { id: 'agw-2', jobId: 'repeat-key-2', workflow: { id: 'wf-2' } },
        ],
      });
      mockAssetGroupRepo.remove.mockResolvedValue(undefined);
      mockWorkflowRepo.delete.mockResolvedValue(undefined);

      const result = await service.delete(groupId);

      expect(mockScanScheduleQueue.removeJobScheduler).toHaveBeenCalledTimes(2);
      expect(mockScanScheduleQueue.removeJobScheduler).toHaveBeenCalledWith(
        'repeat-key-1',
      );
      expect(mockScanScheduleQueue.removeJobScheduler).toHaveBeenCalledWith(
        'repeat-key-2',
      );
      expect(mockWorkflowRepo.delete).toHaveBeenCalledWith(['wf-1', 'wf-2']);
      expect(mockAssetGroupRepo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: groupId }),
      );
      expect(result.message).toContain(groupId);
    });

    it('should not touch schedulers or workflows when the group has no workflows', async () => {
      mockAssetGroupRepo.findOne.mockResolvedValue({
        id: groupId,
        assetGroupAssets: [],
        assetGroupWorkflows: [],
      });
      mockAssetGroupRepo.remove.mockResolvedValue(undefined);

      const result = await service.delete(groupId);

      expect(mockScanScheduleQueue.removeJobScheduler).not.toHaveBeenCalled();
      expect(mockWorkflowRepo.delete).not.toHaveBeenCalled();
      expect(mockAssetGroupRepo.remove).toHaveBeenCalledTimes(1);
      expect(result.message).toContain(groupId);
    });

    it('should throw NotFoundException when the group does not exist', async () => {
      mockAssetGroupRepo.findOne.mockResolvedValue(undefined);

      await expect(service.delete(groupId)).rejects.toThrow(NotFoundException);
      expect(mockScanScheduleQueue.removeJobScheduler).not.toHaveBeenCalled();
      expect(mockWorkflowRepo.delete).not.toHaveBeenCalled();
      expect(mockAssetGroupRepo.remove).not.toHaveBeenCalled();
    });
  });
});
