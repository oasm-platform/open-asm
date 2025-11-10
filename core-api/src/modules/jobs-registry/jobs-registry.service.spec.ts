import { RedisService } from '@/services/redis/redis.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { Asset } from '../assets/entities/assets.entity';
import { DataAdapterService } from '../data-adapter/data-adapter.service';
import { StorageService } from '../storage/storage.service';
import { Tool } from '../tools/entities/tools.entity';
import { WorkspaceTool } from '../tools/entities/workspace_tools.entity';
import { ToolsService } from '../tools/tools.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';

describe('JobsRegistryService', () => {
  let service: JobsRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsRegistryService,
        {
          provide: getRepositoryToken(Job),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(JobHistory),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Tool),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(WorkspaceTool),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Asset),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Vulnerability),
          useClass: Repository,
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
          provide: DataAdapterService,
          useValue: {
            syncData: jest.fn(),
          },
        },
        {
          provide: ToolsService,
          useClass: class MockToolsService {
            toolsRepository = {
              find: jest.fn(),
              findOne: jest.fn(),
              create: jest.fn(),
              save: jest.fn(),
              update: jest.fn(),
              findAndCount: jest.fn(),
            };
            getToolByNames = jest.fn();
            getToolById = jest.fn();
          },
        },
        {
          provide: ApiKeysService,
          useValue: {
            getCurrentApiKey: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn(),
          },
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
