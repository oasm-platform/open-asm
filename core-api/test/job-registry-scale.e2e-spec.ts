import { JobStatus, WorkerScope, WorkerType } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { JobDispatchService } from '@/modules/jobs-registry/job-dispatch.service';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import {
  Target,
  TargetSource,
  TargetType,
} from '@/modules/targets/entities/target.entity';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';
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
      console.info(`createNewJob(${HOSTS} hosts) took ${elapsedMs} ms`);
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
