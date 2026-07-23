import { ToolCategory } from '@/common/enums/enum';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import type { Target } from '@/modules/targets/entities/target.entity';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ToolsService } from '../tools/tools.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type { Workflow } from './entities/workflow.entity';
import { TriggerWorkflowService } from './trigger-workflow.service';

describe('TriggerWorkflowService', () => {
  let service: TriggerWorkflowService;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  let capturedHandler: Function;

  const mockJobRegistryService = {
    createNewJob: jest.fn(),
  };

  const mockWorkspacesService = {
    getWorkspaceIdByTargetId: jest.fn(),
    getWorkspaceConfigValue: jest.fn(),
  };

  const mockToolsService = {
    getToolByNames: jest.fn(),
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
        { name: 'Port Scan', run: 'naabu' },
        { name: 'HTTP Probe', run: 'httpx' },
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
          provide: JobsRegistryService,
          useValue: mockJobRegistryService,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
        {
          provide: ToolsService,
          useValue: mockToolsService,
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
    (mockQueryBuilder.getOne).mockResolvedValue(mockWorkflow);

    mockWorkspacesService.getWorkspaceIdByTargetId.mockResolvedValue(
      'workspace-uuid',
    );
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

    it('should start from first job when isAssetsDiscovery is true', async () => {
      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAssetsDiscovery: true,
      });
      mockToolsService.getToolByNames.mockResolvedValue([
        { name: 'subfinder', category: ToolCategory.SUBDOMAINS, priority: 4 },
        { name: 'naabu', category: ToolCategory.PORTS_SCANNER, priority: 3 },
        { name: 'httpx', category: ToolCategory.HTTP_PROBE, priority: 2 },
      ]);

      service.onModuleInit();
      await invokeHandler('target.domain.create', mockTarget);

      expect(mockJobRegistryService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: expect.objectContaining({ name: 'subfinder' }),
          targetIds: ['target-uuid'],
          workflow: mockWorkflow,
        }),
      );
    });

    it('should skip SUBDOMAINS and start from first non-SUBDOMAINS when isAssetsDiscovery is false', async () => {
      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAssetsDiscovery: false,
      });
      mockToolsService.getToolByNames.mockResolvedValue([
        { name: 'subfinder', category: ToolCategory.SUBDOMAINS, priority: 4 },
        { name: 'naabu', category: ToolCategory.PORTS_SCANNER, priority: 3 },
        { name: 'httpx', category: ToolCategory.HTTP_PROBE, priority: 2 },
      ]);

      service.onModuleInit();
      await invokeHandler('target.domain.create', mockTarget);

      // Should skip subfinder and start with naabu
      expect(mockJobRegistryService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: expect.objectContaining({
            name: 'naabu',
            category: ToolCategory.PORTS_SCANNER,
          }),
          targetIds: ['target-uuid'],
          workflow: mockWorkflow,
        }),
      );
    });

    it('should skip workflow when all jobs are SUBDOMAINS and discovery is disabled', async () => {
      const allSubdomainsWorkflow = {
        ...mockWorkflow,
        content: {
          jobs: [
            { name: 'Scan Subdomain', run: 'subfinder' },
          ],
        },
      };
      (mockDataSource.getRepository('' as any).createQueryBuilder as jest.Mock)().getOne.mockResolvedValue(allSubdomainsWorkflow);

      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAssetsDiscovery: false,
      });
      mockToolsService.getToolByNames.mockResolvedValue([
        { name: 'subfinder', category: ToolCategory.SUBDOMAINS, priority: 4 },
      ]);

      service.onModuleInit();
      await invokeHandler('target.domain.create', mockTarget);

      expect(mockJobRegistryService.createNewJob).not.toHaveBeenCalled();
    });

    it('should not fail when workflow has no jobs', async () => {
      const emptyWorkflow = {
        ...mockWorkflow,
        content: { jobs: [] },
      };
      (mockDataSource.getRepository('' as any).createQueryBuilder as jest.Mock)().getOne.mockResolvedValue(emptyWorkflow);

      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAssetsDiscovery: true,
      });

      service.onModuleInit();
      await invokeHandler('target.domain.create', mockTarget);

      expect(mockJobRegistryService.createNewJob).not.toHaveBeenCalled();
    });
  });
});
