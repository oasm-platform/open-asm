import { JobStatus, WorkerScope, WorkerType } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { JobDispatchService } from '@/modules/jobs-registry/job-dispatch.service';
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
