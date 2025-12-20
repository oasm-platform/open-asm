import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { JobStatus } from '@/common/enums/enum';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, type Repository } from 'typeorm';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';

describe('JobsRegistryService', () => {
  let service: JobsRegistryService;
  let mockJobRepository: Partial<Repository<Job>>;
  let mockJobHistoryRepository: Partial<Repository<JobHistory>>;
  let mockJobErrorLogRepository: Partial<Repository<JobErrorLog>>;

  beforeEach(async () => {
    mockJobRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
    } as any;

    mockJobHistoryRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
    } as any;

    mockJobErrorLogRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsRegistryService,
        {
          provide: getRepositoryToken(Job),
          useValue: mockJobRepository,
        },
        {
          provide: getRepositoryToken(JobHistory),
          useValue: mockJobHistoryRepository,
        },
        {
          provide: getRepositoryToken(JobErrorLog),
          useValue: mockJobErrorLogRepository,
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(),
            getRepository: jest.fn(),
            query: jest.fn(),
          },
        },
        {
          provide: 'DataAdapterService',
          useValue: {
            syncData: jest.fn(),
          },
        },
        {
          provide: 'ToolsService',
          useValue: {
            toolsRepository: {
              find: jest.fn(),
            },
            getToolByNames: jest.fn(),
          },
        },
        {
          provide: 'StorageService',
          useValue: {
            upload: jest.fn(),
          },
        },
        {
          provide: 'RedisService',
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<JobsRegistryService>(JobsRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getManyJobHistories', () => {
    it('should return job histories with totalJobs and calculated status', async () => {
      const workspaceId = randomUUID();
      const mockJobHistories = [
        {
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          jobs: [
            {
              id: randomUUID(),
              status: JobStatus.COMPLETED,
              category: 'SUBDOMAINS',
              createdAt: new Date(),
              updatedAt: new Date(),
              asset: { id: randomUUID(), value: 'test.com' },
              tool: { id: randomUUID(), name: 'subfinder' },
            },
            {
              id: randomUUID(),
              status: JobStatus.COMPLETED,
              category: 'SUBDOMAINS',
              createdAt: new Date(),
              updatedAt: new Date(),
              asset: { id: randomUUID(), value: 'test.com' },
              tool: { id: randomUUID(), name: 'subfinder' },
            },
          ],
        },
      ];

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockJobHistories, mockJobHistories.length]),
      };

      jest
        .spyOn(mockJobHistoryRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getManyJobHistories(workspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      });

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].totalJobs).toBe(2);
      expect(result.data[0].status).toBe(JobStatus.COMPLETED);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'workspace.id = :workspaceId',
        { workspaceId },
      );
    });

    it('should calculate status as IN_PROGRESS when any job is in progress', async () => {
      const workspaceId = randomUUID();
      const mockJobHistories = [
        {
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          jobs: [
            {
              id: randomUUID(),
              status: JobStatus.COMPLETED,
              category: 'SUBDOMAINS',
              createdAt: new Date(),
              updatedAt: new Date(),
              asset: { id: randomUUID(), value: 'test.com' },
              tool: { id: randomUUID(), name: 'subfinder' },
            },
            {
              id: randomUUID(),
              status: JobStatus.IN_PROGRESS,
              category: 'SUBDOMAINS',
              createdAt: new Date(),
              updatedAt: new Date(),
              asset: { id: randomUUID(), value: 'test.com' },
              tool: { id: randomUUID(), name: 'subfinder' },
            },
          ],
        },
      ];

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockJobHistories, mockJobHistories.length]),
      };

      jest
        .spyOn(mockJobHistoryRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getManyJobHistories(workspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      });

      expect(result.data[0].totalJobs).toBe(2);
      expect(result.data[0].status).toBe(JobStatus.IN_PROGRESS);
    });

    it('should calculate status as FAILED when any job is failed', async () => {
      const workspaceId = randomUUID();
      const mockJobHistories = [
        {
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          jobs: [
            {
              id: randomUUID(),
              status: JobStatus.COMPLETED,
              category: 'SUBDOMAINS',
              createdAt: new Date(),
              updatedAt: new Date(),
              asset: { id: randomUUID(), value: 'test.com' },
              tool: { id: randomUUID(), name: 'subfinder' },
            },
            {
              id: randomUUID(),
              status: JobStatus.FAILED,
              category: 'SUBDOMAINS',
              createdAt: new Date(),
              updatedAt: new Date(),
              asset: { id: randomUUID(), value: 'test.com' },
              tool: { id: randomUUID(), name: 'subfinder' },
            },
          ],
        },
      ];

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockJobHistories, mockJobHistories.length]),
      };

      jest
        .spyOn(mockJobHistoryRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getManyJobHistories(workspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      });

      expect(result.data[0].totalJobs).toBe(2);
      expect(result.data[0].status).toBe(JobStatus.FAILED);
    });

    it('should handle empty jobs array', async () => {
      const workspaceId = randomUUID();
      const mockJobHistories = [
        {
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          jobs: [],
        },
      ];

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockJobHistories, mockJobHistories.length]),
      };

      jest
        .spyOn(mockJobHistoryRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getManyJobHistories(workspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      });

      expect(result.data[0].totalJobs).toBe(0);
      expect(result.data[0].status).toBe(JobStatus.COMPLETED); // Default when no jobs
    });
  });
});
