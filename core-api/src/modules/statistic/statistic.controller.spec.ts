import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { WorkspacesService } from '../workspaces/workspaces.service';
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
    getTopPorts: jest.fn(),
    getTopTechnologies: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatisticController],
      providers: [
        {
          provide: StatisticService,
          useValue: mockStatisticService,
        },
        {
          provide: WorkspacesService,
          useValue: {},
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

  describe('getTopPorts', () => {
    it('should call statisticService.getTopPorts', async () => {
      const workspaceId = '1';
      const expectedResult = {
        totalPorts: 10,
        nonstandardPorts: 2,
        ports: [],
      } as any;
      mockStatisticService.getTopPorts.mockResolvedValue(expectedResult);

      const result = await controller.getTopPorts(workspaceId);
      expect(result).toBe(expectedResult);
      expect(service.getTopPorts).toHaveBeenCalledWith(workspaceId);
    });
  });

  describe('getTopTechnologies', () => {
    it('should call statisticService.getTopTechnologies', async () => {
      const workspaceId = '1';
      const expectedResult = { technologies: [] } as any;
      mockStatisticService.getTopTechnologies.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.getTopTechnologies(workspaceId);
      expect(result).toBe(expectedResult);
      expect(service.getTopTechnologies).toHaveBeenCalledWith(workspaceId);
    });
  });
});

describe('StatisticController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getStatistics', 'GET /', ['workspace.read']],
    ['getTimelineStatistics', 'GET /timeline', ['workspace.read']],
    ['getIssuesTimeline', 'GET /issues-timeline', ['workspace.read']],
    ['getTopTagsAssets', 'GET /top-tags-assets', ['workspace.read']],
    ['getAssetLocations', 'GET /asset-locations', ['workspace.read']],
    ['getTlsStatistics', 'GET /tls', ['workspace.read']],
    [
      'getTopAssetsWithMostVulnerabilities',
      'GET /top-assets-vulnerabilities',
      ['workspace.read'],
    ],
    ['getTopPorts', 'GET /top-ports', ['workspace.read']],
    ['getTopTechnologies', 'GET /top-technologies', ['workspace.read']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (StatisticController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      StatisticController,
    ]);
    expect(required).toEqual(keys);
  });
});
