import { Test, type TestingModule } from '@nestjs/testing';
import { AssetsModule } from '../assets/assets.module';
import { StatisticModule } from '../statistic/statistic.module';
import { TargetsModule } from '../targets/targets.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TargetsModule,
        AssetsModule,
        StatisticModule,
      ],
      controllers: [SearchController],
      providers: [
        SearchService,
        {
          provide: 'AssetsService',
          useValue: {
            getManyAsssets: jest.fn(),
          },
        },
        {
          provide: 'TargetsService',
          useValue: {
            getTargetsInWorkspace: jest.fn(),
          },
        },
        {
          provide: 'StatisticService',
          useValue: {
            getTotalAssets: jest.fn(),
            getTotalTargets: jest.fn(),
          },
        },
        {
          provide: 'TechnologyForwarderService',
          useValue: {
            enrichTechnologies: jest.fn(),
            fetchTechnologyInfo: jest.fn(),
            getIconUrl: jest.fn(),
            cacheTechnologyInfo: jest.fn(),
            getCachedTechnologyInfo: jest.fn(),
            getCategoriesForTechnology: jest.fn(),
          },
        },
        {
          provide: 'RedisService',
          useValue: {
            client: {
              get: jest.fn(),
              setex: jest.fn(),
              set: jest.fn(),
            },
            publish: jest.fn(),
            subscribe: jest.fn(),
          },
        },
        {
          provide: 'StorageService',
          useValue: {
            forwardImage: jest.fn(),
            uploadFile: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
