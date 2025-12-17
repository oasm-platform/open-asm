import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { StatisticService } from '../statistic/statistic.service';
import { TargetsService } from '../targets/targets.service';
import { SearchHistory } from './entities/search-history.entity';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let mockSearchHistoryRepository: Partial<Repository<SearchHistory>>;
  let mockAssetService: Partial<AssetsService>;
  let mockTargetService: Partial<TargetsService>;
  let mockStatisticService: Partial<StatisticService>;

  beforeEach(async () => {
    mockSearchHistoryRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getOneOrFail: jest.fn(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
    } as any;

    mockAssetService = {
      getManyAsssets: jest.fn(),
    } as any;

    mockTargetService = {
      getTargetsInWorkspace: jest.fn(),
    } as any;

    mockStatisticService = {
      getTotalAssets: jest.fn(),
      getTotalTargets: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getRepositoryToken(SearchHistory),
          useValue: mockSearchHistoryRepository,
        },
        {
          provide: AssetsService,
          useValue: mockAssetService,
        },
        {
          provide: TargetsService,
          useValue: mockTargetService,
        },
        {
          provide: StatisticService,
          useValue: mockStatisticService,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
