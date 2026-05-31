import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { StatisticController } from './statistic.controller';
import { StatisticService } from './statistic.service';
import type { GetStatisticQueryDto } from './dto/statistic.dto';

describe('StatisticController', () => {
  let controller: StatisticController;
  let service: StatisticService;

  const mockStatisticService = {
    getStatistics: jest.fn(),
    getTimelineStatistics: jest.fn(),
    getIssuesTimeline: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatisticController],
      providers: [
        {
          provide: StatisticService,
          useValue: mockStatisticService,
        },
      ],
    }).compile();

    controller = module.get<StatisticController>(StatisticController);
    service = module.get<StatisticService>(StatisticService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatistics', () => {
    it('should call statisticService.getStatistics', async () => {
      const query: GetStatisticQueryDto = { workspaceId: '1' };
      const expectedResult = { assets: 10, targets: 5 } as any;
      mockStatisticService.getStatistics.mockResolvedValue(expectedResult);

      const result = await controller.getStatistics(query);
      expect(result).toBe(expectedResult);
      expect(service.getStatistics).toHaveBeenCalledWith(query);
    });
  });

  describe('getTimelineStatistics', () => {
    it('should call statisticService.getTimelineStatistics', async () => {
      const workspaceId = '1';
      const expectedResult = { data: [] } as any;
      mockStatisticService.getTimelineStatistics.mockResolvedValue(expectedResult);

      const result = await controller.getTimelineStatistics(workspaceId);
      expect(result).toBe(expectedResult);
      expect(service.getTimelineStatistics).toHaveBeenCalledWith(workspaceId);
    });
  });

  describe('getIssuesTimeline', () => {
    it('should call statisticService.getIssuesTimeline', async () => {
      const workspaceId = '1';
      const expectedResult = { data: [] } as any;
      mockStatisticService.getIssuesTimeline.mockResolvedValue(expectedResult);

      const result = await controller.getIssuesTimeline(workspaceId);
      expect(result).toBe(expectedResult);
      expect(service.getIssuesTimeline).toHaveBeenCalledWith(workspaceId);
    });
  });
});
