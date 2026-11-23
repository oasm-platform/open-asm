import { JobStatus, WorkerScope, WorkerType } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { JobDispatchService } from '@/modules/jobs-registry/job-dispatch.service';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { WorkflowRunnerService } from '@/modules/jobs-registry/workflow-runner.service';
import {
  Target,
  TargetSource,
  TargetType,
} from '@/modules/targets/entities/target.entity';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { WorkersService } from '@/modules/workers/workers.service';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { randomUUID } from 'crypto';
import type { DataSource } from 'typeorm';
import { closeTestApp, createTestApp } from './helpers/app';
import { createUserWithWorkspace } from './helpers/workspace';

/**
 * The job registry's behaviour under load, against the real database: the
 * claim, job creation, run advancement and worker rejoin paths whose
 * correctness depends on SQL (locks, transactions, batch limits) that the
 * mocked unit specs cannot see.
 */
describe('Job registry at scale (e2e)', () => {
  jest.setTimeout(120_000);

  let app: Awaited<ReturnType<typeof createTestApp>>;
  let dataSource: DataSource;
  let workspaceId: string;
  let targetId: string;
  let asset: Asset;
  let subfinder: Tool;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.dataSource;

    const { workspace } = await createUserWithWorkspace(app.server, 'scale');
    workspaceId = workspace.id;

    const domain = `e2e-scale-${Date.now()}.example.com`;
    const target = await dataSource.getRepository(Target).save({
      value: domain,
      type: TargetType.DOMAIN,
      source: TargetSource.MANUAL,
      workspaceId,
      lastDiscoveredAt: new Date(),
      reScanCount: 0,
    });
    targetId = target.id;
    asset = await dataSource.getRepository(Asset).save({
      value: domain,
      targetId,
      isPrimary: true,
      isEnabled: true,
    });
    subfinder = await dataSource
      .getRepository(Tool)
      .findOneByOrFail({ name: 'subfinder' });
  });

  afterEach(async () => {
    if (asset) {
      await dataSource.getRepository(Job).delete({ asset: { id: asset.id } });
    }
  });

  afterAll(async () => {
    if (targetId) {
      // Cascades to assets and their jobs.
      await dataSource.getRepository(Target).delete({ id: targetId });
    }
    await dataSource
      .getRepository(WorkerInstance)
      .delete({ workspaceId });
    await closeTestApp(app?.app);
  });

  async function createWorker(): Promise<WorkerInstance> {
    return dataSource.getRepository(WorkerInstance).save({
      token: randomUUID(),
      name: 'e2e-scale-worker',
      type: WorkerType.BUILT_IN,
      scope: WorkerScope.WORKSPACE,
      workspaceId,
      runMode: 'cli',
      // Written from node, like every heartbeat: the column's database default
      // is in the server's zone and reads back shifted on a non-UTC host.
      lastSeenAt: new Date(),
    });
  }

  async function createPendingJobs(count: number): Promise<Job[]> {
    const history = await dataSource
      .getRepository(JobHistory)
      .save({ jobHistoryName: 'e2e-scale' });
    const base = Date.now();
    const rows = Array.from({ length: count }, (_, i) => ({
      id: randomUUID(),
      jobName: subfinder.name,
      status: JobStatus.PENDING,
      category: 'subdomains',
      command: 'subfinder -d {{value}}',
      priority: 4,
      asset: { id: asset.id },
      tool: { id: subfinder.id },
      jobHistory: { id: history.id },
      // Distinct timestamps give the queue a deterministic order.
      createdAt: new Date(base + i),
    }));
    await dataSource.getRepository(Job).insert(rows as never);
    return rows as unknown as Job[];
  }

  describe('job creation', () => {
    const HOSTS = 50_000;
    const createdTargets: string[] = [];

    afterAll(async () => {
      for (const id of createdTargets) {
        await dataSource.getRepository(Target).delete({ id });
      }
    });

    /** A domain target with `hosts` enabled assets, inserted in bulk. */
    async function createTargetWithHosts(hosts: number): Promise<Target> {
      const domain = `e2e-hosts-${hosts}-${Date.now()}.example.com`;
      const target = await dataSource.getRepository(Target).save({
        value: domain,
        type: TargetType.DOMAIN,
        source: TargetSource.MANUAL,
        workspaceId,
        lastDiscoveredAt: new Date(),
        reScanCount: 0,
      });
      createdTargets.push(target.id);
      const assets = Array.from({ length: hosts }, (_, i) => ({
        value: `h${i}.${domain}`,
        targetId: target.id,
        isPrimary: i === 0,
        isEnabled: true,
      }));
      for (let i = 0; i < assets.length; i += 1_000) {
        await dataSource.getRepository(Asset).insert(assets.slice(i, i + 1_000));
      }
      return target;
    }

    function naabu(): Promise<Tool> {
      return dataSource.getRepository(Tool).findOneByOrFail({ name: 'naabu' });
    }

    it(`creates one job per host for a step over ${HOSTS} hosts`, async () => {
      // Given
      const target = await createTargetWithHosts(HOSTS);

      // When
      const started = Date.now();
      const jobs = await app.app.get(JobsRegistryService).createNewJob({
        tool: await naabu(),
        targetIds: [target.id],
        workspaceId,
        jobName: 'e2e-big-step',
      });
      const elapsedMs = Date.now() - started;

      // Then: every host got a job, and every job is in the database
      expect(jobs).toHaveLength(HOSTS);
      const stored = await dataSource
        .getRepository(Job)
        .count({ where: { asset: { targetId: target.id } } });
      expect(stored).toBe(HOSTS);
      // Recorded for the PR description; not a pass/fail threshold.
      process.stdout.write(`createNewJob(${HOSTS} hosts) took ${elapsedMs} ms\n`);
    }, 600_000);

    it('writes the same job row the previous save() did', async () => {
      // Given
      const target = await createTargetWithHosts(1);
      const tool = await naabu();

      // When
      const [job] = await app.app.get(JobsRegistryService).createNewJob({
        tool,
        targetIds: [target.id],
        workspaceId,
        jobName: 'e2e-row-shape',
        priority: 2,
      });

      // Then: the returned entity carries the generated columns, and the row
      // has every field and relation the dispatch path reads
      expect(job.createdAt).toBeInstanceOf(Date);
      const row = await dataSource.getRepository(Job).findOneOrFail({
        where: { id: job.id },
        relations: { asset: true, tool: true, jobHistory: true },
      });
      expect(row).toMatchObject({
        status: JobStatus.PENDING,
        category: 'ports_scanner',
        // A varchar column: it always reads back as a string.
        priority: '2',
        isSaveRawResult: false,
        isSaveData: true,
        isPublishEvent: false,
        retryCount: 0,
        workerId: null,
        pickJobAt: null,
        inputs: null,
        config: null,
        configProfileId: null,
      });
      expect(row.command).toContain(`h0.${target.value}`);
      expect(row.asset.targetId).toBe(target.id);
      expect(row.tool.id).toBe(tool.id);
      expect(row.jobHistory.id).toBeTruthy();
    });

    it("leaves no job behind when the caller's transaction rolls back", async () => {
      // Given: a step created on a transaction that is then rolled back
      const target = await createTargetWithHosts(3);
      const tool = await naabu();
      const history = await dataSource
        .getRepository(JobHistory)
        .save({ jobHistoryName: 'e2e-rollback' });
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();

      // When
      try {
        const jobs = await app.app.get(JobsRegistryService).createNewJob(
          {
            tool,
            targetIds: [target.id],
            workspaceId,
            jobHistory: history,
          },
          { manager: runner.manager },
        );
        expect(jobs).toHaveLength(3);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }

      // Then
      const stored = await dataSource
        .getRepository(Job)
        .count({ where: { jobHistory: { id: history.id } } });
      expect(stored).toBe(0);
    });
  });

  describe('run advancement', () => {
    const STEP_JOBS = 2_000;
    let workflowId: string | undefined;
    let stepTargetId: string | undefined;
    let burstWorkflowId: string | undefined;
    let burstTargetId: string | undefined;

    afterAll(async () => {
      if (workflowId) {
        // Cascades to its runs and their jobs.
        await dataSource.getRepository(Workflow).delete({ id: workflowId });
      }
      if (stepTargetId) {
        await dataSource.getRepository(Target).delete({ id: stepTargetId });
      }
      if (burstWorkflowId) {
        await dataSource.getRepository(Workflow).delete({ id: burstWorkflowId });
      }
      if (burstTargetId) {
        await dataSource.getRepository(Target).delete({ id: burstTargetId });
      }
    });

    it(`advances a ${STEP_JOBS}-job step once it drains, not once per job`, async () => {
      // Given: a two-step run (naabu → httpx) whose first step has STEP_JOBS jobs
      const domain = `e2e-advance-${Date.now()}.example.com`;
      const target = await dataSource.getRepository(Target).save({
        value: domain,
        type: TargetType.DOMAIN,
        source: TargetSource.MANUAL,
        workspaceId,
        lastDiscoveredAt: new Date(),
        reScanCount: 0,
      });
      stepTargetId = target.id;
      const hosts = Array.from({ length: STEP_JOBS }, (_, i) => ({
        value: `h${i}.${domain}`,
        targetId: target.id,
        isPrimary: i === 0,
        isEnabled: true,
      }));
      for (let i = 0; i < hosts.length; i += 1_000) {
        await dataSource.getRepository(Asset).insert(hosts.slice(i, i + 1_000));
      }
      const workflow = await dataSource.getRepository(Workflow).save({
        name: 'e2e advance',
        filePath: `e2e-advance-${Date.now()}.yaml`,
        workspace: { id: workspaceId },
        content: {
          name: 'e2e advance',
          on: { target: [] },
          jobs: {
            port_scan: { run: 'naabu' },
            http_probe: { run: 'httpx', needs: ['port_scan'] },
          },
        },
      } as unknown as Workflow);
      workflowId = workflow.id;
      const runner = app.app.get(WorkflowRunnerService);
      const { jobHistory } = await runner.startRun({
        workflow,
        workspaceId,
        jobName: 'e2e-advance',
        targetIds: [target.id],
      });
      const runId = jobHistory!.id;
      const jobs = await dataSource.getRepository(Job).find({
        where: { jobHistory: { id: runId } },
        relations: { tool: true },
      });
      expect(jobs).toHaveLength(STEP_JOBS);
      const advance = jest.spyOn(
        runner as unknown as { advance: () => Promise<unknown> },
        'advance',
      );

      // When: every job finishes the way JobResultProcessor finishes it —
      // committed first, then handed to the engine — ten at a time
      const started = Date.now();
      let next = 0;
      await Promise.all(
        Array.from({ length: 10 }, async () => {
          while (next < jobs.length) {
            const job = jobs[next++];
            await dataSource
              .getRepository(Job)
              .update(
                { id: job.id },
                { status: JobStatus.COMPLETED, completedAt: new Date() },
              );
            await runner.onJobTerminal({ ...job, jobHistory: { id: runId } } as Job);
          }
        }),
      );
      const elapsedMs = Date.now() - started;
      const advances = advance.mock.calls.length;
      advance.mockRestore();
      // Recorded for the PR description; not a pass/fail threshold.
      process.stdout.write(
        `${STEP_JOBS} job completions: ${advances} advance(s), ${elapsedMs} ms\n`,
      );

      // Then: the run moved on and finished (httpx has no service to probe),
      // with a handful of advances instead of one per job
      const run = await dataSource
        .getRepository(JobHistory)
        .findOneByOrFail({ id: runId });
      expect(run.steps).toMatchObject({
        port_scan: { status: 'done', jobs: STEP_JOBS },
        http_probe: { status: 'skipped', reason: 'no-inputs' },
      });
      expect(run.isCompleted).toBe(true);
      expect(advances).toBeGreaterThanOrEqual(1);
      expect(advances).toBeLessThanOrEqual(10);
    }, 600_000);

    it('survives every job of a step finishing at the same instant', async () => {
      // Given: a 20-job step whose jobs all commit before any reaches the
      // engine, so each of them sees the step drained
      const domain = `e2e-burst-${Date.now()}.example.com`;
      const target = await dataSource.getRepository(Target).save({
        value: domain,
        type: TargetType.DOMAIN,
        source: TargetSource.MANUAL,
        workspaceId,
        lastDiscoveredAt: new Date(),
        reScanCount: 0,
      });
      burstTargetId = target.id;
      await dataSource.getRepository(Asset).insert(
        Array.from({ length: 20 }, (_, i) => ({
          value: `h${i}.${domain}`,
          targetId: target.id,
          isPrimary: i === 0,
          isEnabled: true,
        })),
      );
      const workflow = await dataSource.getRepository(Workflow).save({
        name: 'e2e burst',
        filePath: `e2e-burst-${Date.now()}.yaml`,
        workspace: { id: workspaceId },
        content: {
          name: 'e2e burst',
          on: { target: [] },
          jobs: {
            port_scan: { run: 'naabu' },
            http_probe: { run: 'httpx', needs: ['port_scan'] },
          },
        },
      } as unknown as Workflow);
      burstWorkflowId = workflow.id;
      const runner = app.app.get(WorkflowRunnerService);
      const { jobHistory } = await runner.startRun({
        workflow,
        workspaceId,
        jobName: 'e2e-burst',
        targetIds: [target.id],
      });
      const runId = jobHistory!.id;
      const jobs = await dataSource.getRepository(Job).find({
        where: { jobHistory: { id: runId } },
        relations: { tool: true },
      });
      await dataSource
        .getRepository(Job)
        .update(
          { jobHistory: { id: runId } },
          { status: JobStatus.COMPLETED, completedAt: new Date() },
        );

      // When: all of them reach the engine together
      const outcome = await Promise.race([
        Promise.all(
          jobs.map((job) =>
            runner.onJobTerminal({ ...job, jobHistory: { id: runId } } as Job),
          ),
        ).then(() => 'done' as const),
        new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 60_000)),
      ]);

      // Then: no pool exhaustion, and the run finished exactly once
      expect(outcome).toBe('done');
      const run = await dataSource
        .getRepository(JobHistory)
        .findOneByOrFail({ id: runId });
      expect(run.isCompleted).toBe(true);
      expect(run.steps).toMatchObject({
        port_scan: { status: 'done', jobs: 20 },
        http_probe: { status: 'skipped', reason: 'no-inputs' },
      });
    }, 120_000);
  });

  describe('worker rejoin', () => {
    async function inProgressJobsOf(worker: WorkerInstance, count: number) {
      const jobs = await createPendingJobs(count);
      await dataSource.getRepository(Job).update(
        jobs.map((job) => job.id),
        { status: JobStatus.IN_PROGRESS, workerId: worker.id, pickJobAt: new Date() },
      );
      return jobs.map((job) => job.id);
    }

    async function statusOf(ids: string[]): Promise<Record<string, string>> {
      const rows = await dataSource
        .getRepository(Job)
        .find({ where: ids.map((id) => ({ id })), select: { id: true, status: true } });
      return Object.fromEntries(rows.map((row) => [row.id, row.status]));
    }

    it('keeps the jobs a rejoining worker still runs and requeues the rest', async () => {
      // Given: a worker with three jobs in progress
      const worker = await createWorker();
      const [kept, alsoKept, lost] = await inProgressJobsOf(worker, 3);

      // When: it rejoins reporting two of them, plus garbage
      await app.app.get(WorkersService).join(
        { apiKey: 'unused', token: worker.token },
        { runningJobIds: [kept, alsoKept, 'not-a-uuid', randomUUID()] },
      );

      // Then
      expect(await statusOf([kept, alsoKept, lost])).toEqual({
        [kept]: JobStatus.IN_PROGRESS,
        [alsoKept]: JobStatus.IN_PROGRESS,
        [lost]: JobStatus.PENDING,
      });
    });

    it('requeues every job of a worker that reports none, as before', async () => {
      // Given
      const worker = await createWorker();
      const ids = await inProgressJobsOf(worker, 2);

      // When: an older worker build rejoins
      await app.app
        .get(WorkersService)
        .join({ apiKey: 'unused', token: worker.token });

      // Then
      expect(Object.values(await statusOf(ids))).toEqual([
        JobStatus.PENDING,
        JobStatus.PENDING,
      ]);
    });

    it("never touches another worker's jobs", async () => {
      // Given: two workers, the second one rejoining
      const owner = await createWorker();
      const rejoining = await createWorker();
      const [owned] = await inProgressJobsOf(owner, 1);

      // When
      await app.app
        .get(WorkersService)
        .join({ apiKey: 'unused', token: rejoining.token }, { runningJobIds: [] });

      // Then
      expect(await statusOf([owned])).toEqual({ [owned]: JobStatus.IN_PROGRESS });
    });

    it('leaves the jobs with the worker when its alive stream drops', async () => {
      // Given
      const worker = await createWorker();
      const ids = await inProgressJobsOf(worker, 2);

      // When
      await app.app.get(WorkersService).workerDisconnected(worker.id);

      // Then
      expect(Object.values(await statusOf(ids))).toEqual([
        JobStatus.IN_PROGRESS,
        JobStatus.IN_PROGRESS,
      ]);
    });
  });

  describe('stale-worker sweep', () => {
    it('requeues exactly the jobs it requeued before', async () => {
      // Given: one job per case the sweep has to tell apart
      const alive = await createWorker();
      const goneWorkerId = randomUUID();
      const [orphaned, ownedByAlive, unowned, retryable, exhausted, done] =
        await createPendingJobs(6);
      const repo = dataSource.getRepository(Job);
      await repo.update(orphaned.id, { status: JobStatus.IN_PROGRESS, workerId: goneWorkerId });
      await repo.update(ownedByAlive.id, { status: JobStatus.IN_PROGRESS, workerId: alive.id });
      await repo.update(unowned.id, { status: JobStatus.IN_PROGRESS });
      await repo.update(retryable.id, { status: JobStatus.FAILED, retryCount: 1 });
      await repo.update(exhausted.id, { status: JobStatus.FAILED, retryCount: 4 });
      await repo.update(done.id, { status: JobStatus.COMPLETED });

      // When
      await app.app.get(WorkersService).autoCleanupWorkersAndJobs();

      // Then
      const rows = await repo.find({
        where: [orphaned, ownedByAlive, unowned, retryable, exhausted, done].map(
          (job) => ({ id: job.id }),
        ),
        select: { id: true, status: true, workerId: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(orphaned.id)).toMatchObject({ status: JobStatus.PENDING, workerId: null });
      expect(byId.get(ownedByAlive.id)).toMatchObject({ status: JobStatus.IN_PROGRESS });
      expect(byId.get(unowned.id)).toMatchObject({ status: JobStatus.IN_PROGRESS });
      expect(byId.get(retryable.id)).toMatchObject({ status: JobStatus.PENDING });
      expect(byId.get(exhausted.id)).toMatchObject({ status: JobStatus.FAILED });
      expect(byId.get(done.id)).toMatchObject({ status: JobStatus.COMPLETED });
    });
  });

  describe('claim', () => {
    it('skips a job another transaction holds instead of waiting for it', async () => {
      // Given: two pending jobs, the oldest locked by an open transaction
      const worker = await createWorker();
      const [first, second] = await createPendingJobs(2);
      const blocker = dataSource.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query('SELECT id FROM jobs WHERE id = $1 FOR UPDATE', [
        first.id,
      ]);

      try {
        // When: a worker claims while the head of the queue is locked
        const claim = app.app
          .get(JobDispatchService)
          .getNextJobs(worker.id, 1);
        const outcome = await Promise.race([
          claim.then((jobs) => ({ jobs })),
          new Promise<'blocked'>((resolve) =>
            setTimeout(() => resolve('blocked'), 5_000),
          ),
        ]);

        // Then: it gets the next job right away
        expect(outcome).not.toBe('blocked');
        expect((outcome as { jobs: Job[] }).jobs.map((job) => job.id)).toEqual([
          second.id,
        ]);
      } finally {
        await blocker.rollbackTransaction();
        await blocker.release();
      }
    });
  });
});
