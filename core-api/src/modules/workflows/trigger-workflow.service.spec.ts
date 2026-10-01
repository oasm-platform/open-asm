import { JobRunType } from '@/common/enums/enum';
import { WorkflowRunnerService } from '@/modules/jobs-registry/workflow-runner.service';
import type { Target } from '@/modules/targets/entities/target.entity';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type { Workflow } from './entities/workflow.entity';
import { TriggerWorkflowService } from './trigger-workflow.service';

describe('TriggerWorkflowService', () => {
  let service: TriggerWorkflowService;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  let capturedHandler: Function;

  const mockWorkflowRunner = {
    startRun: jest.fn(),
  };

  const mockWorkspacesService = {
    getWorkspaceIdByTargetId: jest.fn(),
  };

  const mockEventEmitter = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    onAny: jest.fn().mockImplementation((handler: Function) => {
      capturedHandler = handler;
    }),
  };

  const mockDataSource = {
    getRepository: jest.fn(),
  };

  const mockTarget = {
    id: 'target-uuid',
    value: 'example.com',
  } as Target;

  const mockWorkflow = {
    id: 'workflow-uuid',
    name: 'domain_discovery',
    content: {
      jobs: [
        { name: 'Scan Subdomain', run: 'subfinder' },
        { name: 'Port Scan', run: 'naabu', needs: ['Scan Subdomain'] },
      ],
    },
    workspace: { id: 'workspace-uuid' },
  } as unknown as Workflow;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriggerWorkflowService,
        {
          provide: WorkflowRunnerService,
          useValue: mockWorkflowRunner,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TriggerWorkflowService>(TriggerWorkflowService);

    // Setup getWorkflowByEvent mock: mock the DataSource repo chain
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    mockDataSource.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    });
    mockQueryBuilder.getOne.mockResolvedValue(mockWorkflow);

    mockWorkspacesService.getWorkspaceIdByTargetId.mockResolvedValue(
      'workspace-uuid',
    );
    mockWorkflowRunner.startRun.mockResolvedValue({
      jobHistory: { id: 'history-1' },
      dispatched: 1,
    });
  });

  /** Helper: invoke handler and flush microtasks so the void promise chain completes */
  async function invokeHandler(event: string, payload: Target) {
    capturedHandler(event, payload);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  describe('onModuleInit', () => {
    it('should register an onAny event listener', () => {
      service.onModuleInit();
      expect(mockEventEmitter.onAny).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(capturedHandler).toBeDefined();
    });

    it('starts a run scoped to the event target', async () => {
      service.onModuleInit();
      await invokeHandler('target.domain.create', mockTarget);

      expect(mockWorkflowRunner.startRun).toHaveBeenCalledWith({
        workflow: mockWorkflow,
        workspaceId: 'workspace-uuid',
        jobName: 'domain_discovery - example.com',
        jobRunType: JobRunType.MANUAL,
        targetIds: ['target-uuid'],
      });
    });

    it('does not start a run when no workflow matches the event', async () => {
      (
        mockDataSource.getRepository('').createQueryBuilder as jest.Mock
      )().getOne.mockResolvedValue(null);

      service.onModuleInit();
      await invokeHandler('target.domain.create', mockTarget);

      expect(mockWorkflowRunner.startRun).not.toHaveBeenCalled();
    });

    it('succeeds without a run when every step is filtered out', async () => {
      mockWorkflowRunner.startRun.mockResolvedValue({
        jobHistory: null,
        dispatched: 0,
      });

      const result = await service.trigger('target.domain.create', mockTarget);

      expect(result).toEqual({ workflowId: 'workflow-uuid', success: true });
    });
  });

  describe('trigger', () => {
    it('RED: success → returns { success: true, workflowId }', async () => {
      const result = await service.trigger('target.domain.create', mockTarget);

      expect(result).toEqual({ workflowId: 'workflow-uuid', success: true });
    });

    it('reports a workflow without jobs as a failure', async () => {
      const emptyWorkflow = {
        ...mockWorkflow,
        content: { jobs: [] },
      };
      (
        mockDataSource.getRepository('').createQueryBuilder as jest.Mock
      )().getOne.mockResolvedValue(emptyWorkflow);

      const result = await service.trigger('target.domain.create', mockTarget);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not have any jobs');
      expect(mockWorkflowRunner.startRun).not.toHaveBeenCalled();
    });

    it('RED: orphan configProfileId → returns { success: false, error } with profileId, warn-logs it', async () => {
      const orphanWorkflow = {
        ...mockWorkflow,
        content: {
          jobs: [
            {
              name: 'Nuclei',
              run: 'nuclei',
              configProfileId: 'orphan-profile-id',
            },
          ],
        },
      };
      (
        mockDataSource.getRepository('').createQueryBuilder as jest.Mock
      )().getOne.mockResolvedValue(orphanWorkflow);
      mockWorkflowRunner.startRun.mockRejectedValue(
        new Error('ToolConfigProfile orphan-profile-id not found'),
      );

      const result = await service.trigger('target.domain.create', mockTarget);

      expect(result.success).toBe(false);
      expect(result.workflowId).toBe('workflow-uuid');
      expect(result.error).toContain('orphan-profile-id');
    });
  });
});
