import type { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { CronSchedule } from '@/common/enums/enum';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { User } from '../auth/entities/user.entity';
import type { CreateWorkflowDto } from './dto/create-workflow.dto';
import type { GetManyWorkflowsQueryDto } from './dto/get-many-workflows.dto';
import { Workflow } from './entities/workflow.entity';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let workflowRepository: Repository<Workflow>;

  const mockWorkflow = {
    id: '123e4567-e89b-12d3-a456-42614174000',
    name: 'Test Workflow',
    content: {
      on: { target: ['test'], schedule: CronSchedule.DAILY },
      jobs: [{ name: 'test-job', run: 'test-command' }],
      name: 'Test Workflow Content',
    },
    filePath: 'test-workflow.yaml',
    workspace: { id: 'workspace-1' } as Workspace,
    createdBy: { id: 'user-1' } as User,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        {
          provide: getRepositoryToken(Workflow),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              leftJoin: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getMany: jest.fn(),
              getManyAndCount: jest.fn(),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
    workflowRepository = module.get<Repository<Workflow>>(
      getRepositoryToken(Workflow),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWorkflow', () => {
    it('should create a new workflow', async () => {
      const createWorkflowDto: CreateWorkflowDto = {
        name: 'New Workflow',
        content: {
          on: { target: ['test'], schedule: CronSchedule.DAILY },
          jobs: [{ name: 'test-job', run: 'test-command' }],
          name: 'New Workflow Content',
        },
      };
      const createdBy = { id: 'user-1' };
      const workspace = { id: 'workspace-1' };

      jest
        .spyOn(workflowRepository, 'save')
        .mockResolvedValue(mockWorkflow as Workflow);

      const result = await service.createWorkflow(
        createWorkflowDto,
        createdBy,
        workspace,
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('rejects content whose needs reference an unknown step', async () => {
      const createWorkflowDto = {
        name: 'Broken Workflow',
        content: {
          on: { target: ['test'] },
          jobs: [
            { name: 'Port Scan', run: 'naabu', needs: ['ghost'] },
          ],
          name: 'Broken Workflow Content',
        },
      } as unknown as CreateWorkflowDto;

      await expect(
        service.createWorkflow(createWorkflowDto, { id: 'user-1' }, {
          id: 'workspace-1',
        }),
      ).rejects.toThrow(/Invalid workflow content/);

      expect(workflowRepository.save).not.toHaveBeenCalled();
    });

    it('rejects content with a dependency cycle', async () => {
      const createWorkflowDto = {
        name: 'Cyclic Workflow',
        content: {
          on: { target: ['test'] },
          jobs: [
            { name: 'A', run: 'naabu', needs: ['B'] },
            { name: 'B', run: 'httpx', needs: ['A'] },
          ],
          name: 'Cyclic Workflow Content',
        },
      } as unknown as CreateWorkflowDto;

      await expect(
        service.createWorkflow(createWorkflowDto, { id: 'user-1' }, {
          id: 'workspace-1',
        }),
      ).rejects.toThrow(/cycle/i);
    });

    // The stored shape is canonical: a legacy array is converted on write, so
    // the database converges on the jobs map instead of holding both shapes.
    it('stores legacy array content as a jobs map', async () => {
      const createWorkflowDto = {
        name: 'Legacy Pipeline',
        content: {
          on: { target: ['test'] },
          jobs: [
            { name: 'Scan Subdomain', run: 'subfinder' },
            { name: 'Port Scan', run: 'naabu', needs: ['Scan Subdomain'] },
          ],
          name: 'Legacy Pipeline Content',
        },
      } as unknown as CreateWorkflowDto;
      jest
        .spyOn(workflowRepository, 'save')
        .mockImplementation((workflow) => Promise.resolve(workflow as Workflow));

      const result = await service.createWorkflow(
        createWorkflowDto,
        { id: 'user-1' },
        { id: 'workspace-1' },
      );

      expect(result.content.jobs).toEqual({
        'Scan Subdomain': { run: 'subfinder' },
        'Port Scan': { run: 'naabu', needs: ['Scan Subdomain'] },
      });
    });
  });

  describe('getWorkspaceWorkflow', () => {
    it('should return a workflow from workspace', async () => {
      jest
        .spyOn(workflowRepository, 'findOne')
        .mockResolvedValue(mockWorkflow as Workflow);

      const result = await service.getWorkspaceWorkflow('workflow-1', {
        id: 'workspace-1',
      });
      expect(result).toEqual(mockWorkflow);
    });

    it('should throw error if workflow not found in workspace', async () => {
      jest.spyOn(workflowRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.getWorkspaceWorkflow('workflow-1', { id: 'workspace-1' }),
      ).rejects.toThrow('Workflow not found in this workspace');
    });
  });

  describe('updateWorkflow', () => {
    it('should update workflow properties', async () => {
      const updatedWorkflow = { ...mockWorkflow, name: 'Updated Workflow' };
      jest
        .spyOn(workflowRepository, 'findOne')
        .mockResolvedValue(mockWorkflow as Workflow);
      jest
        .spyOn(workflowRepository, 'save')
        .mockResolvedValue(updatedWorkflow as Workflow);

      const result = await service.updateWorkflow(
        'workflow-1',
        { name: 'Updated Workflow' },
        { id: 'workspace-1' },
      );
      expect(result.name).toBe('Updated Workflow');
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow', async () => {
      const workflowToDelete = { ...mockWorkflow };
      jest
        .spyOn(workflowRepository, 'findOne')
        .mockResolvedValue(workflowToDelete as Workflow);
      jest
        .spyOn(workflowRepository, 'remove')
        .mockResolvedValue(workflowToDelete as Workflow);

      await expect(
        service.deleteWorkflow('workflow-1', { id: 'workspace-1' }),
      ).resolves.not.toThrow();
    });
  });

  describe('getManyWorkflows', () => {
    it('should return paginated workflows', async () => {
      const query: GetManyWorkflowsQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.ASC,
      };
      const mockWorkflows = [mockWorkflow];
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockWorkflows, 1]),
      };

      jest
        .spyOn(workflowRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result: GetManyBaseResponseDto<Workflow> =
        await service.getManyWorkflows(query, 'workspace-1');

      expect(result.data).toEqual(mockWorkflows);
      expect(result.total).toBe(1);
    });
  });
});
