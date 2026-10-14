import { BullMQName, JobRunType } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { WorkflowRunnerService } from '@/modules/jobs-registry/workflow-runner.service';
import { ToolsService } from '@/modules/tools/tools.service';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AssetGroupWorkflowService } from './asset-group-workflow.service';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroup } from './entities/asset-groups.entity';

describe('AssetGroupWorkflowService — runGroupWorkflowScheduler', () => {
  let service: AssetGroupWorkflowService;

  const assetGroupWorkflowRepo = { createQueryBuilder: jest.fn() };
  const assetRepo = { createQueryBuilder: jest.fn() };
  const toolsService = { getToolByNames: jest.fn() };
  const workflowRunnerService = { startRun: jest.fn() };

  const workflow = {
    id: 'workflow-1',
    name: 'Group Workflow - group-1',
    content: {
      on: { schedule: '0 0 */3 * *', target: [] },
      name: 'Group Workflow - group-1',
      jobs: [
        { name: 'naabu', run: 'naabu' },
        { name: 'httpx', run: 'httpx' },
        { name: 'screenshot', run: 'screenshot' },
      ],
    },
    workspace: { id: 'workspace-1' },
  } as unknown as Workflow;

  beforeEach(async () => {
    jest.clearAllMocks();

    assetGroupWorkflowRepo.createQueryBuilder.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'agw-1',
        workflow,
        assetGroup: { id: 'group-1', name: 'group-1' },
      }),
    });
    assetRepo.createQueryBuilder.mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 'asset-1' },
        { id: 'asset-2' },
      ] as Asset[]),
    });
    toolsService.getToolByNames.mockResolvedValue([
      { id: 'tool-naabu', name: 'naabu' },
      { id: 'tool-httpx', name: 'httpx' },
      { id: 'tool-screenshot', name: 'screenshot' },
    ]);
    workflowRunnerService.startRun.mockResolvedValue({
      jobHistory: { id: 'history-1' },
      dispatched: 3,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetGroupWorkflowService,
        { provide: getRepositoryToken(AssetGroup), useValue: {} },
        {
          provide: getRepositoryToken(AssetGroupWorkflow),
          useValue: assetGroupWorkflowRepo,
        },
        { provide: getRepositoryToken(Workflow), useValue: {} },
        { provide: getRepositoryToken(JobHistory), useValue: {} },
        { provide: getRepositoryToken(Asset), useValue: assetRepo },
        {
          provide: getQueueToken(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE),
          useValue: {},
        },
        { provide: ToolsService, useValue: toolsService },
        { provide: WorkflowRunnerService, useValue: workflowRunnerService },
      ],
    }).compile();

    service = module.get(AssetGroupWorkflowService);
  });

  it('starts one run scoped to the group assets', async () => {
    const result = await service.runGroupWorkflowScheduler(
      'agw-1',
      JobRunType.SCHEDULED,
      'workspace-1',
    );

    expect(workflowRunnerService.startRun).toHaveBeenCalledWith({
      workflow,
      workspaceId: 'workspace-1',
      jobName: 'group-1',
      jobRunType: JobRunType.SCHEDULED,
      assetIds: ['asset-1', 'asset-2'],
    });
    expect(result.message).toContain('agw-1');
  });

  it('constrains the lookup to the caller workspace', async () => {
    const andWhere = jest.fn().mockReturnThis();
    assetGroupWorkflowRepo.createQueryBuilder.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere,
      getOne: jest.fn().mockResolvedValue({
        id: 'agw-1',
        workflow,
        assetGroup: { id: 'group-1', name: 'group-1' },
      }),
    });

    await service.runGroupWorkflowScheduler(
      'agw-1',
      JobRunType.SCHEDULED,
      'workspace-1',
    );

    // Without this predicate any workspace member could start another tenant's
    // workflow against that tenant's assets.
    expect(andWhere).toHaveBeenCalledWith('workspace.id = :workspaceId', {
      workspaceId: 'workspace-1',
    });
  });

  it('requires every root step tool to be installed before starting', async () => {
    toolsService.getToolByNames.mockResolvedValue([
      { id: 'tool-httpx', name: 'httpx' },
      { id: 'tool-screenshot', name: 'screenshot' },
    ]);

    await expect(
      service.runGroupWorkflowScheduler(
        'agw-1',
        JobRunType.SCHEDULED,
        'workspace-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(workflowRunnerService.startRun).not.toHaveBeenCalled();
  });

  it('refuses to run a group workflow without assets', async () => {
    assetRepo.createQueryBuilder.mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    await expect(
      service.runGroupWorkflowScheduler(
        'agw-1',
        JobRunType.SCHEDULED,
        'workspace-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when the asset group workflow no longer exists', async () => {
    assetGroupWorkflowRepo.createQueryBuilder.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.runGroupWorkflowScheduler(
        'agw-missing',
        JobRunType.SCHEDULED,
        'workspace-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
