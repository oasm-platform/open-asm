import type { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { CronSchedule } from '@/common/enums/enum';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Repository } from 'typeorm';
import type { User } from '../auth/entities/user.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
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
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Workspace),
          useClass: Repository,
        },
      ],
    })
      .overrideProvider(getRepositoryToken(Workflow))
      .useValue({
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
      })
      .overrideProvider(getRepositoryToken(Workspace))
      .useValue({
        find: jest.fn(),
        findOne: jest.fn(),
      })
      .compile();

    service = module.get<WorkflowsService>(WorkflowsService);
    workflowRepository = module.get<Repository<Workflow>>(
      getRepositoryToken(Workflow),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTemplate', () => {
    it('should return a template by name', async () => {
      jest
        .spyOn(workflowRepository, 'findOne')
        .mockResolvedValue(mockWorkflow as Workflow);

      const result = await service.getTemplate('test-template');
      expect(result).toEqual(mockWorkflow);
    });

    it('should throw error if template not found', async () => {
      jest.spyOn(workflowRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getTemplate('non-existent')).rejects.toThrow(
        'Template non-existent not found',
      );
    });
  });

  describe('listTemplates', () => {
    it('should return YAML files from templates directory', () => {
      const mockFiles = ['workflow1.yaml', 'workflow2.yml', 'other.txt'];
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(mockFiles as any);

      const result = service.listTemplates();
      expect(result).toEqual(['workflow1.yaml', 'workflow2.yml']);
    });

    it('should return empty array if templates directory does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = service.listTemplates();
      expect(result).toEqual([]);
    });
  });

  describe('createDefaultWorkflows', () => {
    it('should create default workflows for a workspace', async () => {
      const mockYamlFiles = ['test-workflow.yaml'];
      const mockFileContent = 'name: Test Workflow\non: { event: test }';

      jest.spyOn(service, 'listTemplates').mockReturnValue(mockYamlFiles);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(mockFileContent);
      jest.spyOn(yaml, 'load').mockReturnValue({
        name: 'Test Workflow',
        on: { event: 'test' },
      });
      jest.spyOn(workflowRepository, 'findOne').mockResolvedValue(null as any);
      jest.spyOn(workflowRepository, 'insert').mockResolvedValue({} as any);

      await service.createDefaultWorkflows('workspace-1');

      expect(workflowRepository.insert).toHaveBeenCalledWith({
        name: '[Default] Test Workflow',
        content: {
          name: 'Test Workflow',
          on: { event: ['test'] },
        },
        filePath: 'test-workflow.yaml',
        workspace: { id: 'workspace-1' } as Workspace,
        isCanDelete: false,
        isCanEdit: false,
      });
    });
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

  describe('getWorkflowsByWorkspace', () => {
    it('should return all workflows for a workspace', async () => {
      jest
        .spyOn(workflowRepository, 'find')
        .mockResolvedValue([mockWorkflow] as Workflow[]);

      const result = await service.getWorkflowsByWorkspace({
        id: 'workspace-1',
      });
      expect(result).toEqual([mockWorkflow]);
    });
  });
});
