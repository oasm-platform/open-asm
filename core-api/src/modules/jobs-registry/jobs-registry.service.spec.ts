import { RedisService } from '@/services/redis/redis.service';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { DataAdapterService } from '../data-adapter/data-adapter.service';
import { StorageService } from '../storage/storage.service';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';

// Mock the ToolsService module to avoid circular dependency
jest.mock('../tools/tools.service', () => ({
  ToolsService: jest.fn().mockImplementation(() => ({
    getToolByNames: jest.fn(),
    getInstalledTools: jest.fn(),
  })),
}));

import { ToolsService } from '../tools/tools.service';

describe('JobsRegistryService - getJobHistoryDetail', () => {
  let service: JobsRegistryService;
  let jobHistoryRepo: Repository<JobHistory>;
  let toolsService: ToolsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsRegistryService,
        {
          provide: getRepositoryToken(Job),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(JobHistory),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(JobErrorLog),
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn(),
          },
        },
        {
          provide: DataAdapterService,
          useValue: {
            syncData: jest.fn(),
          },
        },
        {
          provide: ToolsService,
          useValue: {
            getToolByNames: jest.fn(),
            getInstalledTools: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {},
        },
        {
          provide: RedisService,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<JobsRegistryService>(JobsRegistryService);
    jobHistoryRepo = module.get<Repository<JobHistory>>(
      getRepositoryToken(JobHistory),
    );
    toolsService = module.get<ToolsService>(ToolsService);
  });

  describe('getJobHistoryDetail', () => {
    const mockWorkspaceId = 'workspace-123';
    const mockJobHistoryId = 'history-123';

    it('should return job history detail with workflow and jobs', async () => {
      const mockJobHistory = {
        id: mockJobHistoryId,
        createdAt: new Date(),
        updatedAt: new Date(),
        workflow: {
          id: 'workflow-123',
          name: 'Test Workflow',
          content: {
            on: { target: ['test.com'] },
            jobs: [{ name: 'scan', run: 'nuclei' }],
            name: 'Test Workflow',
          },
        },
        jobs: [
          {
            id: 'job-1',
            status: 'COMPLETED',
            category: 'VULNERABILITY',
            createdAt: new Date(),
            updatedAt: new Date(),
            tool: { id: 'tool-1', name: 'nuclei' },
            asset: {
              id: 'asset-1',
              value: 'test.com',
              target: { id: 'target-1', value: 'test.com' },
            },
            assetService: null,
            errorLogs: [],
            workerId: 'worker-1',
          },
        ],
      };

      const mockInstalledTools = {
        data: [
          {
            id: 'tool-1',
            name: 'nuclei',
            description: 'Nuclei Scanner',
            category: 'VULNERABILITY',
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      };

      jest
        .spyOn(jobHistoryRepo, 'findOne')
        .mockResolvedValue(mockJobHistory as any);

      jest.spyOn(jobHistoryRepo, 'createQueryBuilder').mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      } as any);

      jest
        .spyOn(toolsService, 'getInstalledTools')
        .mockResolvedValue(mockInstalledTools as any);

      const result = await service.getJobHistoryDetail(
        mockWorkspaceId,
        mockJobHistoryId,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(mockJobHistoryId);
      expect(result.tools).toBeDefined();
      expect(result.tools?.length).toBe(1);
      expect(result.tools?.[0].name).toBe('nuclei');
    });

    it('should throw NotFoundException when job history not found', async () => {
      jest.spyOn(jobHistoryRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.getJobHistoryDetail(mockWorkspaceId, mockJobHistoryId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when job history does not belong to workspace', async () => {
      const mockJobHistory = {
        id: mockJobHistoryId,
        createdAt: new Date(),
        updatedAt: new Date(),
        workflow: {
          id: 'workflow-123',
          name: 'Test Workflow',
          content: {
            on: { target: ['test.com'] },
            jobs: [{ name: 'scan', run: 'nuclei' }],
            name: 'Test Workflow',
          },
        },
        jobs: [
          {
            id: 'job-1',
            status: 'COMPLETED',
            category: 'VULNERABILITY',
            createdAt: new Date(),
            updatedAt: new Date(),
            tool: { id: 'tool-1', name: 'nuclei' },
            asset: {
              id: 'asset-1',
              value: 'test.com',
              target: { id: 'target-1', value: 'test.com' },
            },
            assetService: null,
            errorLogs: [],
            workerId: 'worker-1',
          },
        ],
      };

      jest
        .spyOn(jobHistoryRepo, 'findOne')
        .mockResolvedValue(mockJobHistory as any);

      jest.spyOn(jobHistoryRepo, 'createQueryBuilder').mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(false),
      } as any);

      await expect(
        service.getJobHistoryDetail(mockWorkspaceId, mockJobHistoryId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
