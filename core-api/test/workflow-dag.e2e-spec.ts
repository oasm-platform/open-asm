import { Asset } from '@/modules/assets/entities/assets.entity';
import { JobStatus } from '@/common/enums/enum';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { WorkflowRunnerService } from '@/modules/jobs-registry/workflow-runner.service';
import {
  Target,
  TargetSource,
  TargetType,
} from '@/modules/targets/entities/target.entity';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { TriggerWorkflowService } from '@/modules/workflows/trigger-workflow.service';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

/**
 * End-to-end proof of the `needs` DAG engine against the real database.
 *
 * The domain_discovery template is a 4-step chain, so a single trigger must
 * start ONLY the subdomain step and leave the rest waiting — then each
 * simulated job completion must advance exactly one step, and the run must
 * finish by itself once a step fans out to zero jobs (no live services in this
 * fixture) instead of stalling.
 */
describe('Workflow DAG run (e2e)', () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let dataSource: DataSource;
  let trigger: TriggerWorkflowService;
  let runner: WorkflowRunnerService;
  let workspaceId: string;
  let targetId: string;
  let historyId: string | undefined;

  const domain = `e2e-dag-${Date.now()}.example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    trigger = app.get(TriggerWorkflowService);
    runner = app.get(WorkflowRunnerService);

    const [workspace]: { id: string }[] = await dataSource.query(
      'SELECT id FROM workspaces LIMIT 1',
    );
    workspaceId = workspace.id;

    // The template service rewrites the workflow content on boot, so this also
    // proves the new `needs` chain reaches the database.
    const target = await dataSource.getRepository(Target).save({
      value: domain,
      type: TargetType.DOMAIN,
      source: TargetSource.MANUAL,
      workspaceId,
      lastDiscoveredAt: new Date(),
      reScanCount: 0,
    });
    targetId = target.id;

    await dataSource.getRepository(Asset).save({
      value: domain,
      targetId,
      isPrimary: true,
      isEnabled: true,
    });
  });

  afterAll(async () => {
    if (historyId) {
      await dataSource.getRepository(JobHistory).delete({ id: historyId });
    }
    if (targetId) {
      await dataSource.getRepository(Target).delete({ id: targetId });
    }
    await app?.close();
  });

  it('runs a needs chain step by step and finishes when a step has no inputs', async () => {
    const workflow = await dataSource.getRepository(Workflow).findOne({
      where: { filePath: 'domain_discovery.yaml', workspace: { id: workspaceId } },
    });
    expect(workflow).toBeTruthy();
    // The jobs map is keyed by job id; `needs` references those ids.
    expect(workflow!.content.jobs).toEqual({
      scan_subdomain: { name: 'Scan Subdomain', run: 'subfinder' },
      port_scan: {
        name: 'Port Scan',
        run: 'naabu',
        needs: ['scan_subdomain'],
      },
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
    });

    const target = await dataSource
      .getRepository(Target)
      .findOneByOrFail({ id: targetId });

    const result = await trigger.trigger('target.domain.create', target);
    expect(result).toEqual({ workflowId: workflow!.id, success: true });

    const history = await dataSource.getRepository(JobHistory).findOneOrFail({
      where: { workflow: { id: workflow!.id } },
      order: { createdAt: 'DESC' },
      relations: { jobs: { tool: true } },
    });
    historyId = history.id;

    // Only the root job ran; the chain is waiting on `needs`.
    expect(history.steps).toMatchObject({
      scan_subdomain: { status: 'dispatched', jobs: 1 },
      port_scan: { status: 'pending' },
      http_probe: { status: 'pending' },
      take_screenshot: { status: 'pending' },
    });
    expect(history.jobs).toHaveLength(1);
    expect(history.jobs![0].tool.name).toBe('subfinder');
    expect(history.isCompleted).toBe(false);

    // ── subfinder done → naabu dispatched ────────────────────────────────
    await completeJob(history.jobs![0]);
    let current = await reloadHistory(history.id);
    expect(current.steps).toMatchObject({
      scan_subdomain: { status: 'done' },
      port_scan: { status: 'dispatched', jobs: 1 },
      http_probe: { status: 'pending' },
    });
    expect(jobTools(current)).toEqual(['naabu', 'subfinder']);
    expect(current.isCompleted).toBe(false);

    // ── naabu done → httpx has no live services: skipped, and the chain
    //    continues to screenshot, which also has no inputs ───────────────
    await completeJob(jobForTool(current, 'naabu'));
    current = await reloadHistory(history.id);

    expect(current.steps).toMatchObject({
      port_scan: { status: 'done' },
      http_probe: { status: 'skipped', reason: 'no-inputs' },
      take_screenshot: { status: 'skipped', reason: 'no-inputs' },
    });
    // Every step is terminal and no job is left, so the run closed itself.
    expect(current.isCompleted).toBe(true);
  });

  async function completeJob(job: Job): Promise<void> {
    await dataSource
      .getRepository(Job)
      .update(
        { id: job.id },
        { status: JobStatus.COMPLETED, completedAt: new Date() },
      );
    // The job-result processor hands the engine a job with its `jobHistory`
    // relation loaded; the graph only reads the run id from it, so mirror that.
    await runner.onJobTerminal({
      ...job,
      jobHistory: { id: historyId },
    } as unknown as Job);
  }

  async function reloadHistory(id: string): Promise<JobHistory> {
    return dataSource.getRepository(JobHistory).findOneOrFail({
      where: { id },
      relations: { jobs: { tool: true } },
    });
  }

  function jobTools(history: JobHistory): string[] {
    return (history.jobs ?? []).map((job) => job.tool.name).sort();
  }

  function jobForTool(history: JobHistory, toolName: string): Job {
    const job = (history.jobs ?? []).find((entry) => entry.tool.name === toolName);
    if (!job) throw new Error(`No job for tool ${toolName}`);
    return job;
  }
});
