import { Test, type TestingModule } from '@nestjs/testing';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

describe('WorkersController', () => {
  let controller: WorkersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ApiKeysModule,
      ],
      controllers: [WorkersController],
      providers: [
        WorkersService,
        {
          provide: 'WorkerInstanceRepository',
          useValue: {
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: 'AssetRepository',
          useValue: {
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: 'WorkspaceToolRepository',
          useValue: {
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: 'JobsRegistryService',
          useValue: {
            repo: {
              createQueryBuilder: () => ({
                update: () => ({
                  set: () => ({
                    where: () => ({
                      andWhere: () => ({
                        execute: jest.fn(),
                      }),
                    }),
                  }),
                }),
              }),
              count: jest.fn(),
            },
          },
        },
        {
          provide: 'ConfigService',
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WorkersController>(WorkersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
