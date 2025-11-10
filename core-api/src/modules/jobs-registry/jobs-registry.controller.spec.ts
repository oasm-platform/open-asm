import { Test, type TestingModule } from '@nestjs/testing';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';

describe('JobsRegistryController', () => {
  let controller: JobsRegistryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      controllers: [JobsRegistryController],
      providers: [
        JobsRegistryService,
        {
          provide: 'JobRepository',
          useValue: {
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: 'JobHistoryRepository',
          useValue: {
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: 'DataAdapterService',
          useValue: {
            syncData: jest.fn(),
          },
        },
        {
          provide: 'DataSource',
          useValue: {
            createQueryRunner: () => ({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              manager: {
                findOne: jest.fn(),
                save: jest.fn(),
                getRepository: () => ({
                  findOne: jest.fn(),
                  save: jest.fn(),
                }),
              },
              rollbackTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              release: jest.fn(),
            }),
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
            uploadFile: jest.fn(),
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

    controller = module.get<JobsRegistryController>(JobsRegistryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
