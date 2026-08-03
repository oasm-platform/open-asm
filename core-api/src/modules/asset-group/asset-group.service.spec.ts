import { BullMQName, CronSchedule } from '@/common/enums/enum';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { JobHistory } from '../jobs-registry/entities/job-history.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { ToolsService } from '../tools/tools.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import type { Workspace } from '../workspaces/entities/workspace.entity';
import { AssetGroupService } from './asset-group.service';
import type { CreateAssetGroupDto } from './dto/create-asset-group.dto';
import { AssetGroupAsset } from './entities/asset-groups-assets.entity';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroup } from './entities/asset-groups.entity';

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

  const mockAssetGroupAssetRepo = {
    find: jest.fn(),
    create: jest.fn<
      Record<string, unknown>,
      [data: Record<string, unknown>]
    >(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockAssetGroupWorkflowRepo = {
    find: jest.fn(),
    create: jest.fn<
      Record<string, unknown>,
      [data: Record<string, unknown>]
    >(),
    save: jest.fn<
      Promise<Record<string, unknown>[]>,
      [entities: Record<string, unknown>[]]
    >(),
  };

  const mockAssetRepo = {
    findByIds: jest.fn(),
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

  // Query builder chain mock for the per-workflow latest job history lookup
  const createMockJobHistoryBuilder = (rawRows: unknown) => {
    const builder = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinctOn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rawRows),
    };
    return builder;
  };

  const mockJobHistoryRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockToolsService = {};

  const mockJobsRegistryService = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: getRepositoryToken(AssetGroup), useValue: mockAssetGroupRepo },
        {
          provide: getRepositoryToken(AssetGroupAsset),
          useValue: mockAssetGroupAssetRepo,
        },
        {
          provide: getRepositoryToken(AssetGroupWorkflow),
          useValue: mockAssetGroupWorkflowRepo,
        },
        { provide: getRepositoryToken(Asset), useValue: mockAssetRepo },
        { provide: getRepositoryToken(Workflow), useValue: mockWorkflowRepo },
        {
          provide: getRepositoryToken(JobHistory),
          useValue: mockJobHistoryRepo,
        },
        {
          provide: getQueueToken(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE),
          useValue: mockScanScheduleQueue,
        },
        { provide: ToolsService, useValue: mockToolsService },
        { provide: JobsRegistryService, useValue: mockJobsRegistryService },
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

    it('should add assets, create a workflow from tools and assign it with the schedule', async () => {
      const hostAssets = [
        { id: 'asset-1', value: 'example.com' },
        { id: 'asset-2', value: '10.0.0.1' },
      ];
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
      mockAssetGroupRepo.findOne.mockResolvedValue({ id: groupId }); // addManyAssets/addManyWorkflows group lookup
      mockAssetRepo.findByIds.mockResolvedValue(hostAssets);
      mockAssetGroupAssetRepo.find.mockResolvedValue([]);
      mockAssetGroupAssetRepo.create.mockImplementation((data) => ({ ...data }));
      mockManager.find.mockResolvedValue(tools);
      mockWorkflowRepo.create.mockImplementation((data) => data);
      mockWorkflowRepo.save.mockResolvedValue(savedWorkflow);
      mockWorkflowRepo.findByIds.mockResolvedValue([savedWorkflow]);
      mockAssetGroupWorkflowRepo.find.mockResolvedValue([]);
      mockScanScheduleQueue.add.mockResolvedValue({ repeatJobKey: 'repeat-key-1' });

      const result = await service.create(dto, workspaceId);

      expect(result.id).toBe(groupId);

      // Assets added to the group
      expect(mockAssetGroupAssetRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            assetGroup: { id: groupId },
            asset: { id: 'asset-1' },
          }),
          expect.objectContaining({
            assetGroup: { id: groupId },
            asset: { id: 'asset-2' },
          }),
        ]),
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

      // Workflow assigned to the group with the passed schedule
      expect(mockScanScheduleQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { id: expect.any(String) },
        { repeat: { pattern: '0 0 * * *' } },
      );
      expect(mockAssetGroupWorkflowRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          assetGroup: { id: groupId },
          workflow: { id: 'workflow-1' },
          schedule: '0 0 * * *',
        }),
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
      mockWorkflowRepo.findByIds.mockResolvedValue([{ id: 'workflow-1' }]);
      mockAssetGroupWorkflowRepo.find.mockResolvedValue([]);
      mockScanScheduleQueue.add.mockResolvedValue({ repeatJobKey: 'repeat-key-1' });

      await service.create(dto, workspaceId);

      expect(mockScanScheduleQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        { repeat: { pattern: CronSchedule.EVERY_3_DAYS } },
      );
      expect(mockAssetGroupWorkflowRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ schedule: CronSchedule.EVERY_3_DAYS }),
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
  });

  describe('addManyWorkflows', () => {
    it('should use the provided schedule for the repeat job and the record', async () => {
      mockAssetGroupRepo.findOne.mockResolvedValue({ id: 'group-1' });
      mockWorkflowRepo.findByIds.mockResolvedValue([{ id: 'workflow-1' }]);
      mockAssetGroupWorkflowRepo.find.mockResolvedValue([]);
      mockScanScheduleQueue.add.mockResolvedValue({ repeatJobKey: 'repeat-key-1' });
      mockAssetGroupWorkflowRepo.create.mockImplementation((data) => ({
        id: 'agw-1',
        ...data,
      }));

      await service.addManyWorkflows('group-1', ['workflow-1'], '0 0 1 * *');

      expect(mockScanScheduleQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { id: expect.any(String) },
        { repeat: { pattern: '0 0 1 * *' } },
      );
      expect(mockAssetGroupWorkflowRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ schedule: '0 0 1 * *' }),
      );
    });

    it('should default to EVERY_3_DAYS when no schedule is passed', async () => {
      mockAssetGroupRepo.findOne.mockResolvedValue({ id: 'group-1' });
      mockWorkflowRepo.findByIds.mockResolvedValue([{ id: 'workflow-1' }]);
      mockAssetGroupWorkflowRepo.find.mockResolvedValue([]);
      mockScanScheduleQueue.add.mockResolvedValue({ repeatJobKey: 'repeat-key-1' });
      mockAssetGroupWorkflowRepo.create.mockImplementation((data) => ({
        id: 'agw-1',
        ...data,
      }));

      await service.addManyWorkflows('group-1', ['workflow-1']);

      expect(mockScanScheduleQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { id: expect.any(String) },
        { repeat: { pattern: CronSchedule.EVERY_3_DAYS } },
      );
    });
  });

  describe('getAssetGroupById', () => {
    const workspaceId = 'workspace-uuid';
    const groupId = 'group-1';

    const rawLastRun = {
      id: 'jh-1',
      workflowId: 'wf-1',
      createdAt: new Date('2026-08-01T10:00:00Z'),
      updatedAt: new Date('2026-08-01T10:30:00Z'),
      totalJobs: '3',
      status: 'COMPLETED',
      workflowName: 'Group Workflow - group-1',
      jobHistoryName: 'Group Workflow - group-1',
      jobRunType: 'MANUAL',
    };

    const rawLastRun2 = {
      id: 'jh-2',
      workflowId: 'wf-2',
      createdAt: new Date('2026-08-01T09:00:00Z'),
      updatedAt: new Date('2026-08-01T09:15:00Z'),
      totalJobs: '1',
      status: 'FAILED',
      workflowName: 'Group Workflow - group-2',
      jobHistoryName: 'Group Workflow - group-2',
      jobRunType: 'MANUAL',
    };

    beforeEach(() => {
      mockJobHistoryRepo.createQueryBuilder.mockImplementation(() =>
        createMockJobHistoryBuilder([rawLastRun]),
      );
    });

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

      expect(mockJobHistoryRepo.createQueryBuilder).toHaveBeenCalledWith(
        'jobHistory',
      );
      expect(result.assetGroupWorkflows[0].lastRun).toEqual({
        id: 'jh-1',
        createdAt: rawLastRun.createdAt,
        updatedAt: rawLastRun.updatedAt,
        totalJobs: 3,
        status: 'COMPLETED',
        workflowName: 'Group Workflow - group-1',
        jobHistoryName: 'Group Workflow - group-1',
        jobRunType: 'MANUAL',
      });
    });

    it('should attach a distinct lastRun per workflow', async () => {
      mockJobHistoryRepo.createQueryBuilder.mockImplementation(() =>
        createMockJobHistoryBuilder([rawLastRun, rawLastRun2]),
      );
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
      expect(mockJobHistoryRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should set lastRun to null when no job history exists', async () => {
      mockJobHistoryRepo.createQueryBuilder.mockImplementation(() =>
        createMockJobHistoryBuilder([]),
      );
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
      mockAssetGroupAssetRepo.remove.mockResolvedValue(undefined);
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
      expect(mockAssetGroupAssetRepo.remove).toHaveBeenCalledWith([
        { id: 'aga-1' },
      ]);
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
