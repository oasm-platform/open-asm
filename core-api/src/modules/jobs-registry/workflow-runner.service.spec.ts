import {
  EventTriggerType,
  JobRunType,
  ToolCategory,
} from '@/common/enums/enum';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { ToolsService } from '@/modules/tools/tools.service';
import type { Tool } from '@/modules/tools/entities/tools.entity';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import type { Workflow } from '@/modules/workflows/entities/workflow.entity';
import type {
  StepJobSummary,
  WorkflowStepDefinition,
} from '@/modules/workflows/workflow-graph';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { JobHistory } from './entities/job-history.entity';
import type { Job } from './entities/job.entity';
import { WorkflowRunnerService } from './workflow-runner.service';

function tool(name: string, category: ToolCategory): Tool {
  return { id: `tool-${name}`, name, category, priority: 4 } as Tool;
}

/**
 * Builds a workflow whose `jobs` map is keyed by each definition's display
 * name, so the assertions can address steps by their readable label.
 */
function workflow(
  jobs: WorkflowStepDefinition[],
  overrides: Partial<Workflow> = {},
): Workflow {
  return {
    id: 'workflow-1',
    name: 'domain_discovery',
    filePath: 'domain_discovery.yaml',
    content: {
      on: { target: ['domain.create'] },
      jobs: Object.fromEntries(
        jobs.map((job) => [job.name ?? job.run, job]),
      ),
      name: 'domain_discovery',
    },
    workspace: { id: 'workspace-1' },
    ...overrides,
  } as unknown as Workflow;
}

interface FakeDb {
  dataSource: { createQueryRunner: jest.Mock };
  history: JobHistory;
  setSummaries: (summaries: StepJobSummary[]) => void;
  setActiveCount: (count: number) => void;
  setLastJob: (job: Job | null) => void;
}

/** Arguments the runner passes to JobsRegistryService.createNewJob. */
interface CreateNewJobArgs {
  tool: Tool;
  config?: Record<string, unknown>;
  configProfileId?: string;
  targetIds?: string[];
  assetIds?: string[];
  workflow: Workflow;
  jobHistory: JobHistory;
  priority?: number;
  workspaceId: string;
}

/**
 * Shape of the fluent builder the runner uses. Annotating it is what keeps the
 * self-referential `jest.fn(() => builder)` chain from being inferred as `any`.
 */
interface QueryRunnerChain {
  setLock: jest.Mock;
  innerJoin: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  groupBy: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getOne: jest.Mock;
  getRawMany: jest.Mock;
  getCount: jest.Mock;
}

function createFakeDb(overrides: Partial<JobHistory> = {}): FakeDb {
  const history = {
    id: 'history-1',
    steps: {},
    scope: null,
    isCompleted: false,
    jobHistoryName: 'domain_discovery - example.com',
    jobRunType: JobRunType.MANUAL,
    ...overrides,
  } as unknown as JobHistory;

  let summaries: StepJobSummary[] = [];
  let activeCount = 0;
  let lastJob: Job | null = null;

  const historyBuilder: QueryRunnerChain = {
    setLock: jest.fn(() => historyBuilder),
    innerJoin: jest.fn(() => historyBuilder),
    leftJoinAndSelect: jest.fn(() => historyBuilder),
    select: jest.fn(() => historyBuilder),
    addSelect: jest.fn(() => historyBuilder),
    where: jest.fn(() => historyBuilder),
    andWhere: jest.fn(() => historyBuilder),
    groupBy: jest.fn(() => historyBuilder),
    orderBy: jest.fn(() => historyBuilder),
    addOrderBy: jest.fn(() => historyBuilder),
    getOne: jest.fn(() => Promise.resolve(history)),
    getRawMany: jest.fn(() => Promise.resolve(summaries)),
    getCount: jest.fn(() => Promise.resolve(activeCount)),
  };

  const jobBuilder: QueryRunnerChain = {
    setLock: jest.fn(() => jobBuilder),
    innerJoin: jest.fn(() => jobBuilder),
    leftJoinAndSelect: jest.fn(() => jobBuilder),
    select: jest.fn(() => jobBuilder),
    addSelect: jest.fn(() => jobBuilder),
    where: jest.fn(() => jobBuilder),
    andWhere: jest.fn(() => jobBuilder),
    groupBy: jest.fn(() => jobBuilder),
    orderBy: jest.fn(() => jobBuilder),
    addOrderBy: jest.fn(() => jobBuilder),
    getOne: jest.fn(() => Promise.resolve(lastJob)),
    getRawMany: jest.fn(() => Promise.resolve(summaries)),
    getCount: jest.fn(() => Promise.resolve(activeCount)),
  };

  const manager = {
    create: jest.fn(
      (entity: unknown, data: Record<string, unknown>): unknown => {
        if (entity === JobHistory) {
          Object.assign(history, data);
          return history;
        }
        return { ...data };
      },
    ),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    update: jest.fn(
      (
        _entity: unknown,
        _criteria: unknown,
        patch: Partial<JobHistory>,
      ): Promise<{ affected: number }> => {
        Object.assign(history, patch);
        return Promise.resolve({ affected: 1 });
      },
    ),
    createQueryBuilder: jest.fn((entity: unknown) =>
      entity === JobHistory ? historyBuilder : jobBuilder,
    ),
  };
  const queryRunner = {
    connect: jest.fn(),
    release: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    manager,
  };

  return {
    dataSource: { createQueryRunner: jest.fn(() => queryRunner) },
    history,
    setSummaries: (next) => {
      summaries = next;
    },
    setActiveCount: (count) => {
      activeCount = count;
    },
    setLastJob: (job) => {
      lastJob = job;
    },
  };
}

describe('WorkflowRunnerService', () => {
  let service: WorkflowRunnerService;
  let db: FakeDb;

  const createNewJob = jest.fn<Promise<unknown[]>, [CreateNewJobArgs]>();
  const getToolByNames = jest.fn();
  const getWorkspaceConfigValue = jest.fn();
  const emit = jest.fn();

  async function setup(fake: FakeDb) {
    db = fake;
    jest.clearAllMocks();
    createNewJob.mockImplementation(() => Promise.resolve([{ id: 'job-1' }]));
    getWorkspaceConfigValue.mockResolvedValue({ isAssetsDiscovery: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowRunnerService,
        { provide: DataSource, useValue: fake.dataSource },
        { provide: JobsRegistryService, useValue: { createNewJob } },
        { provide: ToolsService, useValue: { getToolByNames } },
        { provide: WorkspacesService, useValue: { getWorkspaceConfigValue } },
        { provide: EventEmitter2, useValue: { emit } },
      ],
    }).compile();

    service = module.get(WorkflowRunnerService);
  }

  describe('startRun', () => {
    it('creates one run and dispatches every root in parallel', async () => {
      await setup(createFakeDb());
      getToolByNames.mockResolvedValue([
        tool('naabu', ToolCategory.PORTS_SCANNER),
        tool('httpx', ToolCategory.HTTP_PROBE),
        tool('nuclei', ToolCategory.VULNERABILITIES),
      ]);

      const result = await service.startRun({
        workflow: workflow([
          { name: 'Port Scan', run: 'naabu' },
          { name: 'HTTP Probe', run: 'httpx' },
          { name: 'Vuln Scan', run: 'nuclei' },
        ]),
        workspaceId: 'workspace-1',
        jobName: 'domain_discovery - example.com',
        targetIds: ['target-1'],
      });

      expect(result.jobHistory).toBeTruthy();
      expect(createNewJob).toHaveBeenCalledTimes(3);
      // One shared history for the whole run — that is what makes it one run.
      const histories = createNewJob.mock.calls.map(
        ([args]) => args.jobHistory,
      );
      expect(new Set(histories).size).toBe(1);
      expect(histories[0]).toBe(db.history);
      expect(db.history.scope).toEqual({ targetIds: ['target-1'] });
      expect(emit).toHaveBeenCalledWith(
        EventTriggerType.WORKFLOW_START,
        expect.objectContaining({
          workflow: expect.anything(),
          targetIds: ['target-1'],
        }),
      );
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('only dispatches the root of a needs chain', async () => {
      await setup(createFakeDb());
      getToolByNames.mockResolvedValue([
        tool('subfinder', ToolCategory.SUBDOMAINS),
        tool('naabu', ToolCategory.PORTS_SCANNER),
      ]);

      await service.startRun({
        workflow: workflow([
          { name: 'Scan Subdomain', run: 'subfinder' },
          { name: 'Port Scan', run: 'naabu', needs: ['Scan Subdomain'] },
        ]),
        workspaceId: 'workspace-1',
        jobName: 'domain_discovery - example.com',
        targetIds: ['target-1'],
      });

      expect(createNewJob).toHaveBeenCalledTimes(1);
      expect(createNewJob.mock.calls[0][0].tool.name).toBe('subfinder');
      expect(db.history.steps['Scan Subdomain'].status).toBe('dispatched');
      expect(db.history.steps['Port Scan'].status).toBe('pending');
    });

    it('records the skipped subdomain step and roots the chain when assets discovery is off', async () => {
      await setup(createFakeDb());
      getWorkspaceConfigValue.mockResolvedValue({ isAssetsDiscovery: false });
      getToolByNames.mockResolvedValue([
        tool('subfinder', ToolCategory.SUBDOMAINS),
        tool('naabu', ToolCategory.PORTS_SCANNER),
        tool('httpx', ToolCategory.HTTP_PROBE),
      ]);

      await service.startRun({
        workflow: workflow([
          { name: 'Scan Subdomain', run: 'subfinder' },
          { name: 'Port Scan', run: 'naabu', needs: ['Scan Subdomain'] },
          { name: 'HTTP Probe', run: 'httpx', needs: ['Port Scan'] },
        ]),
        workspaceId: 'workspace-1',
        jobName: 'domain_discovery - example.com',
        targetIds: ['target-1'],
      });

      expect(createNewJob).toHaveBeenCalledTimes(1);
      expect(createNewJob.mock.calls[0][0].tool.name).toBe('naabu');
      expect(db.history.steps['Scan Subdomain']).toMatchObject({
        status: 'skipped',
        reason: 'assets-discovery-off',
      });
      expect(db.history.steps['Port Scan'].status).toBe('dispatched');
    });

    it('creates no run when every step is skipped by the assets discovery switch', async () => {
      await setup(createFakeDb());
      getWorkspaceConfigValue.mockResolvedValue({ isAssetsDiscovery: false });
      getToolByNames.mockResolvedValue([
        tool('subfinder', ToolCategory.SUBDOMAINS),
      ]);

      const result = await service.startRun({
        workflow: workflow([{ name: 'Scan Subdomain', run: 'subfinder' }]),
        workspaceId: 'workspace-1',
        jobName: 'domain_discovery - example.com',
        targetIds: ['target-1'],
      });

      expect(result.jobHistory).toBeNull();
      expect(result.dispatched).toBe(0);
      expect(createNewJob).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('creates no run for a workflow without jobs', async () => {
      await setup(createFakeDb());

      const result = await service.startRun({
        workflow: workflow([]),
        workspaceId: 'workspace-1',
        jobName: 'empty',
        targetIds: ['target-1'],
      });

      expect(result.jobHistory).toBeNull();
      expect(getToolByNames).not.toHaveBeenCalled();
    });

    it('keeps an asset-group run pinned to the selected assets', async () => {
      await setup(createFakeDb());
      getToolByNames.mockResolvedValue([
        tool('naabu', ToolCategory.PORTS_SCANNER),
        tool('httpx', ToolCategory.HTTP_PROBE),
      ]);

      await service.startRun({
        workflow: workflow([
          { name: 'Port Scan', run: 'naabu' },
          { name: 'HTTP Probe', run: 'httpx' },
        ]),
        workspaceId: 'workspace-1',
        jobName: 'group-1',
        jobRunType: JobRunType.SCHEDULED,
        assetIds: ['asset-1', 'asset-2'],
      });

      expect(db.history.scope).toEqual({ assetIds: ['asset-1', 'asset-2'] });
      for (const [args] of createNewJob.mock.calls as [
        { assetIds?: string[]; targetIds?: string[] },
      ][]) {
        expect(args.targetIds).toBeUndefined();
        expect(args.assetIds).toEqual(['asset-1', 'asset-2']);
      }
    });

    // Asset groups created before the job-map switch still hold `jobs` as an
    // array. They must keep running: the ids come from the old names and, with
    // no `needs` anywhere, every job is a root and starts in parallel.
    it('runs a legacy array workflow as parallel roots', async () => {
      await setup(createFakeDb());
      getToolByNames.mockResolvedValue([
        tool('subfinder', ToolCategory.SUBDOMAINS),
        tool('naabu', ToolCategory.PORTS_SCANNER),
      ]);
      const legacyWorkflow = workflow([]);
      (legacyWorkflow.content as unknown as { jobs: unknown }).jobs = [
        { name: 'Scan Subdomain', run: 'subfinder' },
        { name: 'Port Scan', run: 'naabu' },
      ];

      const result = await service.startRun({
        workflow: legacyWorkflow,
        workspaceId: 'workspace-1',
        jobName: 'group-1',
        jobRunType: JobRunType.SCHEDULED,
        assetIds: ['asset-1'],
      });

      expect(result.dispatched).toBe(2);
      expect(createNewJob).toHaveBeenCalledTimes(2);
      expect(db.history.steps).toMatchObject({
        'Scan Subdomain': { status: 'dispatched', jobs: 1 },
        'Port Scan': { status: 'dispatched', jobs: 1 },
      });
    });
  });

  describe('advanceRun', () => {
    it('does nothing for an unrelated run', async () => {
      await setup(createFakeDb({ workflow: undefined }));

      await service.advanceRun('history-1');

      expect(createNewJob).not.toHaveBeenCalled();
    });

    it('never re-dispatches a completed run', async () => {
      await setup(createFakeDb({ isCompleted: true, workflow: workflow([]) }));

      await service.advanceRun('history-1');

      expect(createNewJob).not.toHaveBeenCalled();
    });

    it('dispatches the dependent step once the dependency jobs are done', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([
            { name: 'Scan Subdomain', run: 'subfinder' },
            { name: 'Port Scan', run: 'naabu', needs: ['Scan Subdomain'] },
          ]),
          steps: {
            'Scan Subdomain': { status: 'dispatched', jobs: 2 },
          },
        }),
      );
      getToolByNames.mockResolvedValue([
        tool('subfinder', ToolCategory.SUBDOMAINS),
        tool('naabu', ToolCategory.PORTS_SCANNER),
      ]);
      db.setSummaries([
        {
          tool: 'subfinder',
          total: 2,
          pending: 0,
          inProgress: 0,
          completed: 2,
          failed: 0,
          cancelled: 0,
        },
      ]);

      await service.advanceRun('history-1');

      expect(createNewJob).toHaveBeenCalledTimes(1);
      expect(createNewJob.mock.calls[0][0].tool.name).toBe('naabu');
      expect(db.history.steps['Scan Subdomain'].status).toBe('done');
      expect(db.history.steps['Port Scan'].status).toBe('dispatched');
    });

    it('skips dependents of a failed step and completes the run', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([
            { name: 'Scan Subdomain', run: 'subfinder' },
            { name: 'Port Scan', run: 'naabu', needs: ['Scan Subdomain'] },
          ]),
          steps: {
            'Scan Subdomain': { status: 'dispatched', jobs: 1 },
          },
        }),
      );
      getToolByNames.mockResolvedValue([
        tool('subfinder', ToolCategory.SUBDOMAINS),
        tool('naabu', ToolCategory.PORTS_SCANNER),
      ]);
      db.setSummaries([
        {
          tool: 'subfinder',
          total: 1,
          pending: 0,
          inProgress: 0,
          completed: 0,
          failed: 1,
          cancelled: 0,
        },
      ]);
      db.setLastJob({ id: 'job-1' } as Job);

      await service.advanceRun('history-1');

      expect(createNewJob).not.toHaveBeenCalled();
      expect(db.history.steps['Scan Subdomain'].status).toBe('failed');
      expect(db.history.steps['Port Scan']).toMatchObject({
        status: 'skipped',
        reason: 'blocked-by-failure',
      });
      expect(db.history.isCompleted).toBe(true);
      expect(emit).toHaveBeenCalledWith(
        EventTriggerType.WORKFLOW_END,
        expect.objectContaining({ id: 'job-1' }),
      );
    });

    it('keeps the run open while another job of the run is still executing', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([{ name: 'Port Scan', run: 'naabu' }]),
        }),
      );
      getToolByNames.mockResolvedValue([
        tool('naabu', ToolCategory.PORTS_SCANNER),
      ]);
      db.setSummaries([
        {
          tool: 'naabu',
          total: 1,
          pending: 1,
          inProgress: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        },
      ]);
      db.setActiveCount(1);

      await service.advanceRun('history-1');

      expect(createNewJob).not.toHaveBeenCalled();
      expect(db.history.isCompleted).toBe(false);
      expect(emit).not.toHaveBeenCalledWith(
        EventTriggerType.WORKFLOW_END,
        expect.anything(),
      );
    });

    it('marks a step with no inputs as skipped and keeps going', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([
            { name: 'Port Scan', run: 'naabu' },
            { name: 'HTTP Probe', run: 'httpx', needs: ['Port Scan'] },
            { name: 'Take Screenshot', run: 'screenshot', needs: ['HTTP Probe'] },
          ]),
          // The previous step already finished; httpx is what runs next.
          steps: { 'Port Scan': { status: 'done', jobs: 1 } },
        }),
      );
      getToolByNames.mockResolvedValue([
        tool('naabu', ToolCategory.PORTS_SCANNER),
        tool('httpx', ToolCategory.HTTP_PROBE),
        tool('screenshot', ToolCategory.SCREENSHOT),
      ]);
      createNewJob.mockImplementation(({ tool: called }) =>
        Promise.resolve(
          called.name === 'httpx' ? [] : [{ id: `${called.name}-job` }],
        ),
      );

      await service.advanceRun('history-1');

      // httpx skipped for lack of live services; screenshot still reachable
      // because a no-inputs skip does not block dependents.
      expect(createNewJob.mock.calls.map(([args]) => args.tool.name)).toEqual([
        'httpx',
        'screenshot',
      ]);
      expect(db.history.steps['HTTP Probe']).toMatchObject({
        status: 'skipped',
        reason: 'no-inputs',
      });
      expect(db.history.steps['Take Screenshot'].status).toBe('dispatched');
    });

    it('fails a ready step whose tool cannot be resolved without aborting the run', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([
            { name: 'Port Scan', run: 'naabu' },
            { name: 'Vuln Scan', run: 'nuclei' },
            { name: 'HTTP Probe', run: 'httpx', needs: ['Vuln Scan'] },
          ]),
        }),
      );
      // nuclei is not resolvable in this workspace.
      getToolByNames.mockResolvedValue([
        tool('naabu', ToolCategory.PORTS_SCANNER),
        tool('httpx', ToolCategory.HTTP_PROBE),
      ]);

      await service.advanceRun('history-1');

      expect(createNewJob).toHaveBeenCalledTimes(1);
      expect(createNewJob.mock.calls[0][0].tool.name).toBe('naabu');
      expect(db.history.steps['Vuln Scan'].status).toBe('failed');
      expect(db.history.steps['HTTP Probe']).toMatchObject({
        status: 'skipped',
        reason: 'blocked-by-failure',
      });
      // naabu is still running, so the run is not done yet.
      expect(db.history.isCompleted).toBe(false);
    });

    it('fails the step when job creation throws and still skips its dependents', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([
            { name: 'Port Scan', run: 'naabu' },
            { name: 'HTTP Probe', run: 'httpx', needs: ['Port Scan'] },
          ]),
        }),
      );
      getToolByNames.mockResolvedValue([
        tool('naabu', ToolCategory.PORTS_SCANNER),
        tool('httpx', ToolCategory.HTTP_PROBE),
      ]);
      createNewJob.mockRejectedValue(new Error('orphan profile'));
      db.setLastJob({ id: 'job-1' } as Job);

      await service.advanceRun('history-1');

      expect(db.history.steps['Port Scan'].status).toBe('failed');
      expect(db.history.steps['HTTP Probe']).toMatchObject({
        status: 'skipped',
        reason: 'blocked-by-failure',
      });
      expect(db.history.isCompleted).toBe(true);
    });

    it('completes a single-step run once its only job finished', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([{ name: 'Vuls Scan', run: 'nuclei' }]),
          steps: { 'Vuls Scan': { status: 'dispatched', jobs: 1 } },
        }),
      );
      getToolByNames.mockResolvedValue([
        tool('nuclei', ToolCategory.VULNERABILITIES),
      ]);
      db.setSummaries([
        {
          tool: 'nuclei',
          total: 1,
          pending: 0,
          inProgress: 0,
          completed: 1,
          failed: 0,
          cancelled: 0,
        },
      ]);
      db.setLastJob({ id: 'job-9' } as Job);

      await service.advanceRun('history-1');

      expect(createNewJob).not.toHaveBeenCalled();
      expect(db.history.isCompleted).toBe(true);
      expect(db.history.steps['Vuls Scan'].status).toBe('done');
    });
  });

  describe('onJobTerminal', () => {
    it('advances the run the job belongs to', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([
            { name: 'Port Scan', run: 'naabu' },
            { name: 'HTTP Probe', run: 'httpx', needs: ['Port Scan'] },
          ]),
          steps: { 'Port Scan': { status: 'dispatched', jobs: 1 } },
        }),
      );
      getToolByNames.mockResolvedValue([
        tool('naabu', ToolCategory.PORTS_SCANNER),
        tool('httpx', ToolCategory.HTTP_PROBE),
      ]);
      db.setSummaries([
        {
          tool: 'naabu',
          total: 1,
          pending: 0,
          inProgress: 0,
          completed: 1,
          failed: 0,
          cancelled: 0,
        },
      ]);

      await service.onJobTerminal({
        id: 'job-1',
        jobHistory: { id: 'history-1' },
      } as Job);

      expect(createNewJob.mock.calls[0][0].tool.name).toBe('httpx');
    });

    it('ignores a job without a run', async () => {
      await setup(createFakeDb());

      await service.onJobTerminal({ id: 'job-1' } as Job);

      expect(createNewJob).not.toHaveBeenCalled();
    });
  });

  describe('job completion rollup', () => {
    it('treats a cancelled run as finished', async () => {
      await setup(
        createFakeDb({
          workflow: workflow([{ name: 'Port Scan', run: 'naabu' }]),
        }),
      );
      getToolByNames.mockResolvedValue([
        tool('naabu', ToolCategory.PORTS_SCANNER),
      ]);
      db.setSummaries([
        {
          tool: 'naabu',
          total: 1,
          pending: 0,
          inProgress: 0,
          completed: 0,
          failed: 0,
          cancelled: 1,
        },
      ]);

      await service.advanceRun('history-1');

      expect(db.history.steps['Port Scan']).toMatchObject({
        status: 'skipped',
        reason: 'run-cancelled',
      });
      expect(db.history.isCompleted).toBe(true);
    });
  });
});
