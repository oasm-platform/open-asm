import { BullMQName, CronSchedule } from '@/common/enums/enum';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Asset } from '../assets/entities/assets.entity';
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
  };

  const mockScanScheduleQueue = {
    add: jest.fn(),
    removeJobScheduler: jest.fn(),
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
          filePath: '',
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
});
