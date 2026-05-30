import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { StatisticCronService } from './statistic-cron.service';
import { StatisticService } from './statistic.service';

describe('StatisticCronService', () => {
  let service: StatisticCronService;
  let statisticService: StatisticService;

  const mockStatisticService = {
    calculateAndStoreStatistics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticCronService,
        {
          provide: StatisticService,
          useValue: mockStatisticService,
        },
      ],
    }).compile();

    service = module.get<StatisticCronService>(StatisticCronService);
    statisticService = module.get<StatisticService>(StatisticService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleCron', () => {
    it('should call statisticService.calculateAndStoreStatistics', async () => {
      await service.handleCron();
      expect(statisticService.calculateAndStoreStatistics).toHaveBeenCalled();
    });
  });
});
