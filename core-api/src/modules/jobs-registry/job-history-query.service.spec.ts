import {
  JobPriority,
  JobRunType,
  JobStatus,
  TargetType,
  ToolCategory,
  WorkerType,
} from '@/common/enums/enum';
import { NotFoundError } from '@/common/errors/domain.errors';
import type { DataSource, Repository } from 'typeorm';
import type { ToolsService } from '../tools/tools.service';
import type { JobErrorLog } from './entities/job-error-log.entity';
import type { JobHistory } from './entities/job-history.entity';
import type { Job } from './entities/job.entity';
import { JobHistoryQueryService } from './job-history-query.service';

const HOST = [TargetType.DOMAIN, TargetType.IP, TargetType.CIDR];

describe('JobHistoryQueryService', () => {
  let service: JobHistoryQueryService;

  const mockJobRepository = {
    createQueryBuilder: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn(),
    exists: jest.fn(),
  };

  const mockJobHistoryRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockJobErrorLogRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(),
    getRepository: jest.fn(),
  };

  const mockToolsService = {
    getInstalledTools: jest.fn(),
    getToolByNames: jest.fn(),
  };

  beforeEach(() => {
    service = new JobHistoryQueryService(
      mockJobRepository as unknown as Repository<Job>,
      mockJobHistoryRepository as unknown as Repository<JobHistory>,
      mockJobErrorLogRepository as unknown as Repository<JobErrorLog>,
      mockDataSource as unknown as DataSource,
      mockToolsService as unknown as ToolsService,
    );
  });

  describe('getJobHistoryDetail', () => {
    const mockWorkspaceId = 'workspace-uuid';
    const mockHistoryId = 'history-uuid';
    const mockJobs = [
      {
        id: 'job-1',
        status: JobStatus.COMPLETED,
        tool: { name: 'test-tool' },
      },
    ];
    const mockJobHistory = {
      id: mockHistoryId,
      createdAt: new Date(),
      updatedAt: new Date(),
      jobs: mockJobs,
      steps: {},
      workflow: {
        name: 'test-workflow',
        content: {
          jobs: { test_step: { name: 'Test Step', run: 'test-tool' } },
        },
      },
      jobHistoryName: 'test-job-history',
    };

    it('should return job history detail with tools and their statuses', async () => {
      const mockTool = {
        id: 'tool-uuid',
        name: 'test-tool',
        description: 'A test tool',
        command: 'test-command',
        categories: [{ name: ToolCategory.SUBDOMAINS, targetTypes: HOST }],
        version: '1.0',
        logoUrl: 'http://example.com/logo.png',
        isBuiltIn: true,
        isInstalled: true,
        isOfficialSupport: true,
        type: WorkerType.BUILT_IN,
        providerId: 'provider-uuid',
        priority: JobPriority.BACKGROUND,
        availableWorkersCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([
        { toolId: 'tool-uuid', status: JobStatus.COMPLETED },
      ]);
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [mockTool],
      });

      const result = await service.getJobHistoryDetail(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(mockJobHistoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockHistoryId },
        relations: {
          workflow: true,
        },
      });
      expect(result).toEqual({
        id: mockHistoryId,
        workflowName: 'test-workflow',
        jobHistoryName: 'test-job-history',
        createdAt: mockJobHistory.createdAt,
        updatedAt: mockJobHistory.updatedAt,
        activeJobsCount: undefined,
        jobRunType: undefined,
        progress: 100,
        stepsDone: 1,
        stepsTotal: 1,
        etaSeconds: null,
        failureReason: null,
        tools: [
          {
            id: 'tool-uuid',
            name: 'test-tool',
            logoUrl: 'http://example.com/logo.png',
            status: JobStatus.COMPLETED,
          },
        ],
        steps: [
          {
            id: 'test_step',
            name: 'Test Step',
            run: 'test-tool',
            category: 'subdomains',
            needs: [],
            // Derived from the job rows for a run created before the engine.
            status: 'done',
            jobs: 0,
            toolId: 'tool-uuid',
            logoUrl: 'http://example.com/logo.png',
          },
        ],
      });
      // Bandwidth contract: tools must expose only id/name/logoUrl/status
      expect(Object.keys(result.tools![0]).sort()).toEqual([
        'id',
        'logoUrl',
        'name',
        'status',
      ]);
    });

    it('should report a tool as cancelled rather than completed once the run was cancelled', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({ data: [] });

      await service.getJobHistoryDetail(mockWorkspaceId, mockHistoryId);

      // The tool status query is not the only one on the job repository, so
      // look for its CASE expression across every select call.
      const selectArgs = (mockJobRepository.select.mock.calls as unknown[][])
        .map(([arg]) => arg)
        .filter((arg): arg is string[] => Array.isArray(arg))
        .flat();
      const statusExpr = selectArgs.find((s) => s.includes('CASE'))!;
      // Regression: a tool whose jobs finished before the cancel used to keep a
      // green check, because the COMPLETED branch was reached first.
      expect(statusExpr).toContain(
        `WHEN COUNT(CASE WHEN job.status = '${JobStatus.CANCELLED}' THEN 1 END) > 0`,
      );
      expect(statusExpr.indexOf(JobStatus.CANCELLED)).toBeLessThan(
        statusExpr.indexOf(JobStatus.COMPLETED),
      );
    });

    it('should return detail for a history whose jobs were all deleted (ownership proven via workflow, tool status undefined)', async () => {
      const mockTool = {
        id: 'tool-uuid',
        name: 'test-tool',
        logoUrl: 'http://example.com/logo.png',
      };

      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      // No job rows: the deleted-jobs scenario
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [mockTool],
      });

      const result = await service.getJobHistoryDetail(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result).toEqual({
        id: mockHistoryId,
        workflowName: 'test-workflow',
        jobHistoryName: 'test-job-history',
        createdAt: mockJobHistory.createdAt,
        updatedAt: mockJobHistory.updatedAt,
        activeJobsCount: undefined,
        jobRunType: undefined,
        progress: 0,
        stepsDone: 0,
        stepsTotal: 1,
        etaSeconds: null,
        failureReason: null,
        tools: [
          {
            id: 'tool-uuid',
            name: 'test-tool',
            logoUrl: 'http://example.com/logo.png',
            status: undefined,
          },
        ],
        steps: [
          {
            id: 'test_step',
            name: 'Test Step',
            run: 'test-tool',
            needs: [],
            status: 'pending',
            jobs: 0,
            toolId: 'tool-uuid',
            logoUrl: 'http://example.com/logo.png',
          },
        ],
      });
    });

    it('exposes the persisted step state of a DAG run', async () => {
      const dagHistory = {
        ...mockJobHistory,
        steps: {
          scan_subdomain: {
            status: 'done',
            jobs: 1,
            dispatchedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:05:00.000Z',
          },
          port_scan: { status: 'dispatched', jobs: 3, failed: 1 },
          http_probe: {
            status: 'skipped',
            jobs: 0,
            reason: 'blocked-by-failure',
          },
        },
        workflow: {
          name: 'test-workflow',
          content: {
            // Stored in jsonb key order, NOT authored order, exactly as Postgres
            // hands it back — the response must still come out dependencies-first.
            jobs: {
              http_probe: {
                name: 'HTTP Probe',
                run: 'httpx',
                needs: ['port_scan'],
              },
              take_screenshot: {
                name: 'Take Screenshot',
                run: 'screenshot',
                needs: ['http_probe'],
              },
              scan_subdomain: {
                name: 'Scan Subdomain',
                run: 'subfinder',
              },
              port_scan: {
                name: 'Port Scan',
                run: 'naabu',
                needs: ['scan_subdomain'],
              },
            },
          },
        },
      };
      mockJobHistoryRepository.findOne.mockResolvedValue(dagHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({ data: [] });

      const result = await service.getJobHistoryDetail(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.steps).toEqual([
        {
          id: 'scan_subdomain',
          name: 'Scan Subdomain',
          run: 'subfinder',
          needs: [],
          status: 'done',
          jobs: 1,
          dispatchedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:05:00.000Z'),
        },
        {
          id: 'port_scan',
          name: 'Port Scan',
          run: 'naabu',
          needs: ['scan_subdomain'],
          status: 'dispatched',
          jobs: 3,
          failed: 1,
        },
        {
          id: 'http_probe',
          name: 'HTTP Probe',
          run: 'httpx',
          needs: ['port_scan'],
          status: 'skipped',
          reason: 'blocked-by-failure',
          jobs: 0,
        },
        {
          id: 'take_screenshot',
          name: 'Take Screenshot',
          run: 'screenshot',
          needs: ['http_probe'],
          status: 'pending',
          jobs: 0,
        },
      ]);
    });

    it('lists each step with its category and the legacy tool list once per tool', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue({
        ...mockJobHistory,
        steps: {},
        workflow: {
          name: 'test-workflow',
          content: {
            jobs: {
              ports: { run: 'nmap', category: 'ports_scanner' },
              vulns: { run: 'nmap', category: 'vulnerabilities', needs: ['ports'] },
              probe: { run: 'httpx', needs: ['vulns'] },
            },
          },
        },
      });
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [
          {
            id: 'tool-nmap',
            name: 'nmap',
            categories: [
              { name: ToolCategory.PORTS_SCANNER, targetTypes: [] },
              { name: ToolCategory.VULNERABILITIES, targetTypes: [] },
            ],
          },
          {
            id: 'tool-httpx',
            name: 'httpx',
            categories: [{ name: ToolCategory.HTTP_PROBE, targetTypes: [] }],
          },
        ],
      });

      const result = await service.getJobHistoryDetail(mockWorkspaceId, mockHistoryId);

      expect(result.steps!.map((step) => [step.id, step.category])).toEqual([
        ['ports', 'ports_scanner'],
        ['vulns', 'vulnerabilities'],
        ['probe', 'http_probe'],
      ]);
      expect(result.tools!.map((tool) => tool.name)).toEqual(['nmap', 'httpx']);
    });

    it('should throw NotFoundException when job history not found', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getJobHistoryDetail(mockWorkspaceId, mockHistoryId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundException when job history not in workspace', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(false),
      });

      await expect(
        service.getJobHistoryDetail(mockWorkspaceId, mockHistoryId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should not crash when job history has no workflow', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue({
        ...mockJobHistory,
        workflow: null,
      });
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({ data: [] });

      const result = await service.getJobHistoryDetail(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.workflowName).toBeUndefined();
      expect(result.tools).toEqual([]);
    });
  });

  describe('getJobHistoryWorkflow', () => {
    const mockWorkspaceId = 'workspace-uuid';
    const mockHistoryId = 'history-uuid';
    const mockJobHistory = {
      id: mockHistoryId,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: {},
      jobHistoryName: 'test-job-history',
      workflow: {
        id: 'workflow-uuid',
        name: 'test-workflow',
        content: {
          name: 'test-workflow',
          jobs: { test_step: { name: 'Test Step', run: 'test-tool' } },
        },
      },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({ data: [] });
    });

    it('should return the workflow definition of the run as stored', async () => {
      // Scrambled on purpose: jsonb returns object keys in its own order.
      mockJobHistory.workflow.content = {
        jobs: { test_step: { name: 'Test Step', run: 'test-tool' } },
        name: 'test-workflow',
      };
      const result = await service.getJobHistoryWorkflow(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.workflowId).toBe('workflow-uuid');
      expect(result.workflowName).toBe('test-workflow');
      expect(result.content).toEqual(mockJobHistory.workflow.content);
      // Regression: jsonb does not keep key order, so the code view used to
      // print `jobs` before `name` — the opposite of every workflow template.
      expect(Object.keys(result.content!)).toEqual(['name', 'jobs']);
    });

    it('should keep each job category in the stored definition', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValueOnce({
        ...mockJobHistory,
        workflow: {
          ...mockJobHistory.workflow,
          content: {
            name: 'test-workflow',
            jobs: {
              ports: { run: 'nmap', category: 'ports_scanner' },
              vulns: { run: 'nmap', category: 'vulnerabilities', needs: ['ports'] },
            },
          },
        },
      });

      const result = await service.getJobHistoryWorkflow(mockWorkspaceId, mockHistoryId);

      expect(result.content!.jobs).toEqual({
        ports: { run: 'nmap', category: 'ports_scanner' },
        vulns: { run: 'nmap', category: 'vulnerabilities', needs: ['ports'] },
      });
    });

    it('should count the jobs a worker is executing per step (tool + category)', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValueOnce({
        ...mockJobHistory,
        steps: {
          ports: { status: 'dispatched', jobs: 3 },
          vulns: { status: 'dispatched', jobs: 2 },
        },
        workflow: {
          ...mockJobHistory.workflow,
          content: {
            name: 'test-workflow',
            jobs: {
              ports: { run: 'nmap', category: 'ports_scanner' },
              vulns: { run: 'nmap', category: 'vulnerabilities' },
            },
          },
        },
      });
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [
          {
            id: 'tool-nmap',
            name: 'nmap',
            categories: [
              { name: ToolCategory.PORTS_SCANNER, targetTypes: HOST },
              { name: ToolCategory.VULNERABILITIES, targetTypes: HOST },
            ],
          },
        ],
      });
      mockJobRepository.getRawMany
        // Tool badge statuses.
        .mockResolvedValueOnce([])
        // In-progress jobs per step: the same tool in two categories stays apart.
        .mockResolvedValueOnce([
          { toolId: 'tool-nmap', category: 'ports_scanner', running: '2' },
          { toolId: 'tool-nmap', category: 'vulnerabilities', running: '0' },
        ]);

      const result = await service.getJobHistoryWorkflow(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.steps).toEqual([
        expect.objectContaining({ id: 'ports', status: 'dispatched', running: 2 }),
        // Dispatched but not picked up by a worker yet: no running count.
        expect.objectContaining({ id: 'vulns', status: 'dispatched' }),
      ]);
      expect(result.steps[1].running).toBeUndefined();
    });

    it('counts the failed jobs of a running step live, and keeps a finished step as recorded', async () => {
      // Given: a running step whose stored state predates two failures, and a
      // finished step whose jobs were partly pruned since
      mockJobHistoryRepository.findOne.mockResolvedValueOnce({
        ...mockJobHistory,
        steps: {
          ports: { status: 'dispatched', jobs: 5 },
          vulns: { status: 'done', jobs: 4, failed: 3 },
        },
        workflow: {
          ...mockJobHistory.workflow,
          content: {
            name: 'test-workflow',
            jobs: {
              ports: { run: 'nmap', category: 'ports_scanner' },
              vulns: { run: 'nmap', category: 'vulnerabilities' },
            },
          },
        },
      });
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [
          {
            id: 'tool-nmap',
            name: 'nmap',
            categories: [
              { name: ToolCategory.PORTS_SCANNER, targetTypes: HOST },
              { name: ToolCategory.VULNERABILITIES, targetTypes: HOST },
            ],
          },
        ],
      });
      mockJobRepository.getRawMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { toolId: 'tool-nmap', category: 'ports_scanner', running: '1', failed: '2' },
          { toolId: 'tool-nmap', category: 'vulnerabilities', running: '0', failed: '1' },
        ]);

      // When
      const result = await service.getJobHistoryWorkflow(
        mockWorkspaceId,
        mockHistoryId,
      );

      // Then
      expect(result.steps).toEqual([
        expect.objectContaining({ id: 'ports', failed: 2 }),
        expect.objectContaining({ id: 'vulns', failed: 3 }),
      ]);
    });

    it('should include the run steps so the page can show state next to the definition', async () => {
      const result = await service.getJobHistoryWorkflow(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.steps).toEqual([
        expect.objectContaining({ id: 'test_step', run: 'test-tool' }),
      ]);
    });

    it('should throw NotFoundException when the run is not in the workspace', async () => {
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(false),
      });

      await expect(
        service.getJobHistoryWorkflow(mockWorkspaceId, mockHistoryId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getJobsTimeline', () => {
    // Two categories of one tool on one target in one run (e.g. nmap ports,
    // then nmap vulnerabilities) are separate steps and must stay separate bars.
    it('starts a new group when the job category changes and groups by it', async () => {
      const query = jest.fn().mockResolvedValue([]);
      (mockDataSource as Record<string, unknown>).query = query;

      await service.getJobsTimeline('ws-1');

      const sql = (query.mock.calls[0][0] as string).replace(/\s+/g, ' ');
      expect(sql).toContain(
        'lag(jobs.category) over (partition by jobs."jobHistoryId" order by jobs."createdAt" desc) = jobs.category',
      );
      expect(sql).toContain('group by grp_id, name, tool_category, target, target_id, "jobHistoryId"');
    });
  });

  describe('getManyJobHistories', () => {
    const mockWorkspaceId = 'workspace-uuid';

    interface HistoryQueryBuilder {
      innerJoin: jest.Mock<HistoryQueryBuilder>;
      leftJoin: jest.Mock<HistoryQueryBuilder>;
      where: jest.Mock<HistoryQueryBuilder>;
      andWhere: jest.Mock<HistoryQueryBuilder>;
      select: (args: unknown[]) => HistoryQueryBuilder;
      groupBy: jest.Mock<HistoryQueryBuilder>;
      addGroupBy: jest.Mock<HistoryQueryBuilder>;
      having: jest.Mock<HistoryQueryBuilder>;
      orderBy: jest.Mock<HistoryQueryBuilder>;
      addOrderBy: jest.Mock<HistoryQueryBuilder>;
      offset: jest.Mock<HistoryQueryBuilder>;
      limit: jest.Mock<HistoryQueryBuilder>;
      getRawMany: jest.Mock<Promise<unknown[]>>;
      getCount: jest.Mock<Promise<number>>;
    }

    const buildHistoryQueryBuilder = () => {
      const selectArgs: unknown[][] = [];
      const qb: HistoryQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn((args: unknown[]) => {
          selectArgs.push(args);
          return qb;
        }),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };
      return { qb, selectArgs };
    };

    /**
     * The method builds a SINGLE query builder. `total` used to require a
     * second, distinct-id aggregate pass; it now rides on the paged select as a
     * `COUNT(*) OVER ()` window, so tests drive one builder and the row count
     * arrives in the same rows.
     */
    const stubHistoryQueryBuilder = () => {
      const paged = buildHistoryQueryBuilder();
      mockJobHistoryRepository.createQueryBuilder.mockReset();
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue(paged.qb);
      return { paged };
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should compute totalJobs and status from joined jobs without correlated subqueries', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb, selectArgs } = paged;
      qb.getRawMany.mockResolvedValue([
        {
          id: 'history-1',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-02T00:00:00Z'),
          totalJobs: '4',
          status: JobStatus.IN_PROGRESS,
          workflowName: 'workflow-1',
          jobHistoryName: 'run-1',
          jobRunType: JobRunType.MANUAL,
          total: '2',
        },
      ]);

      const result = await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(selectArgs[0]).toContain('COUNT(job.id) as "totalJobs"');
      // No correlated subquery referencing the jobs table from scratch
      expect(
        selectArgs[0].some(
          (s) => typeof s === 'string' && s.includes('FROM jobs'),
        ),
      ).toBe(false);
      // Status derived from the joined job rows via aggregate FILTER
      const statusExpr = selectArgs[0].find(
        (s) => typeof s === 'string' && s.includes('FILTER'),
      ) as string;
      expect(statusExpr).toContain(`job.status = '${JobStatus.FAILED}'`);
      expect(statusExpr).toContain(`job.status = '${JobStatus.IN_PROGRESS}'`);
      expect(selectArgs[0]).toContain('COUNT(*) OVER () as "total"');
      // One query serves both the page and its total
      expect(mockJobHistoryRepository.createQueryBuilder).toHaveBeenCalledTimes(
        1,
      );
      expect(result.total).toBe(2);
    });

    it('should aggregate terminal cancelled status when all jobs are cancelled', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb, selectArgs } = paged;
      qb.getRawMany.mockResolvedValue([]);

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      const statusExpr = selectArgs[0].find(
        (s) => typeof s === 'string' && s.includes('FILTER'),
      ) as string;
      // All-cancelled histories must surface as cancelled, not pending
      expect(statusExpr).toContain(`THEN '${JobStatus.CANCELLED}'`);
      expect(statusExpr).toContain(
        `job.status = '${JobStatus.CANCELLED}') > 0`,
      );
    });

    it('should surface a cancelled run even when some jobs already completed', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb, selectArgs } = paged;
      qb.getRawMany.mockResolvedValue([]);

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      const statusExpr = selectArgs[0].find(
        (s) => typeof s === 'string' && s.includes('FILTER'),
      ) as string;
      // Derived purely from the child jobs: a cancelled job with nothing left
      // pending/in-progress means the user stopped the run. Without this branch
      // a run cancelled after 30/100 jobs would fall through to "pending".
      expect(statusExpr).toContain(
        `WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.CANCELLED}') > 0`,
      );
      expect(statusExpr).toContain(
        `COUNT(*) FILTER (WHERE job.status IN ('${JobStatus.PENDING}', '${JobStatus.IN_PROGRESS}')) = 0`,
      );
      expect(statusExpr.indexOf(JobStatus.CANCELLED)).toBeLessThan(
        statusExpr.indexOf(JobStatus.FAILED),
      );
    });

    it('should aggregate terminal skipped status when all jobs are skipped', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb, selectArgs } = paged;
      qb.getRawMany.mockResolvedValue([]);

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      const statusExpr = selectArgs[0].find(
        (s) => typeof s === 'string' && s.includes('FILTER'),
      ) as string;
      // All-skipped histories must surface as skipped, not pending
      expect(statusExpr).toContain(
        `WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.SKIPPED}') = COUNT(*) AND COUNT(*) > 0 THEN '${JobStatus.SKIPPED}'`,
      );
    });

    it('should fall back to createdAt and append an id tiebreaker for unknown sortBy', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb } = paged;

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: '__proto__',
        sortOrder: 'ASC',
      } as any);

      expect(qb.orderBy).toHaveBeenCalledWith('jobHistory.createdAt', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('jobHistory.id', 'ASC');
    });

    it('should pass through whitelisted sortBy values', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb } = paged;

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'jobHistoryName',
        sortOrder: 'DESC',
      } as any);

      expect(qb.orderBy).toHaveBeenCalledWith(
        'jobHistory.jobHistoryName',
        'DESC',
      );
    });

    it('should transform raw rows into the response DTO shape', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb } = paged;
      qb.getRawMany.mockResolvedValue([
        {
          id: 'history-1',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-02T00:00:00Z'),
          totalJobs: '5',
          status: JobStatus.COMPLETED,
          workflowName: 'workflow-1',
          jobHistoryName: 'name-1',
          jobRunType: 'manual',
        },
      ]);

      const result = await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(result.data[0]).toEqual({
        id: 'history-1',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        totalJobs: 5,
        completedJobs: 0,
        failedJobs: 0,
        progress: 0,
        status: JobStatus.COMPLETED,
        workflowName: 'workflow-1',
        jobHistoryName: 'name-1',
        jobRunType: 'manual',
      });
    });

    it('should apply the search predicate to the page query', async () => {
      const { paged } = stubHistoryQueryBuilder();

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        search: 'nightly',
      } as any);

      expect(paged.qb.andWhere).toHaveBeenCalledWith(
        '(jobHistory.jobHistoryName ILIKE :search OR workflow.name ILIKE :search)',
        { search: '%nightly%' },
      );
    });

    it('should filter on the status rollup via HAVING, and skip it for "all"', async () => {
      const filtered = stubHistoryQueryBuilder();

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobStatus: JobStatus.FAILED,
      } as any);

      const [havingSql, havingParams] = filtered.paged.qb.having.mock.calls[0] as [
        string,
        { jobStatus: string },
      ];
      expect(havingSql).toContain('FILTER');
      expect(havingParams).toEqual({ jobStatus: JobStatus.FAILED });

      const unfiltered = stubHistoryQueryBuilder();
      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobStatus: 'all',
      } as any);
      expect(unfiltered.paged.qb.having).not.toHaveBeenCalled();
    });

    it('should filter by run type and a creation-date range on the page query', async () => {
      const { paged } = stubHistoryQueryBuilder();

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobRunType: JobRunType.SCHEDULED,
        createdFrom: '2026-01-01',
        createdTo: '2026-01-31',
      } as any);

      const ranged = (qb: typeof paged.qb) => {
        expect(qb.andWhere).toHaveBeenCalledWith(
          'jobHistory.jobRunType = :jobRunType',
          { jobRunType: JobRunType.SCHEDULED },
        );
        expect(qb.andWhere).toHaveBeenCalledWith(
          'jobHistory.createdAt >= :createdFrom',
          { createdFrom: new Date('2026-01-01') },
        );
        const [, params] = qb.andWhere.mock.calls.find(
          ([sql]) => sql === 'jobHistory.createdAt <= :createdTo',
        ) as [string, { createdTo: Date }];
        // A bare date means "through the end of that day".
        expect(params.createdTo.getHours()).toBe(23);
        expect(params.createdTo.getMilliseconds()).toBe(999);
      };

      ranged(paged.qb);
    });

    it('should skip run type and date filters for "all" / absent values', async () => {
      const { paged } = stubHistoryQueryBuilder();

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobRunType: 'all',
      } as any);

      expect(paged.qb.andWhere).not.toHaveBeenCalled();
    });
  });
});
