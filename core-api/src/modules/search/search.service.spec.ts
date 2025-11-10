import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { StatisticService } from '../statistic/statistic.service';
import { TargetsService } from '../targets/targets.service';
import { SearchHistory } from './entities/search-history.entity';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getRepositoryToken(SearchHistory),
          useClass: Repository,
        },
        {
          provide: AssetsService,
          useValue: {
            getManyAsssets: jest.fn(),
          },
        },
        {
          provide: TargetsService,
          useValue: {
            getTargetsInWorkspace: jest.fn(),
          },
        },
        {
          provide: StatisticService,
          useValue: {
            getTotalAssets: jest.fn(),
            getTotalTargets: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
