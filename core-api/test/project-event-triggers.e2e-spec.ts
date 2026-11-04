import { JobStatus } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import type { Job } from '@/modules/jobs-registry/entities/job.entity';
import { WorkflowRunnerService } from '@/modules/jobs-registry/workflow-runner.service';
import {
  Target,
  TargetSource,
  TargetType,
} from '@/modules/targets/entities/target.entity';
import type { App } from 'supertest/types';
import * as request from 'supertest';
import type { DataSource } from 'typeorm';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { cleanupE2eData, createUserWithWorkspace } from './helpers/workspace';

/** A run as the chain assertions read it. */
interface RunRow {
  id: string;
  projectWorkflowId: string;
  jobRunType: string;
  triggerId: string | null;
  causedByRunId: string | null;
  chainDepth: number;
  scope: { assetIds?: string[] } | null;
}

/**
 * Event triggers of project workflows, through the real event bridge.
 *
 * Nothing is called directly: adding an asset and finishing a run publish
 * `project.assets.added` and `project.run.completed` to the Redis stream, the
 * projects lane hands them to the triggers, and the BullMQ batch job starts
 * the run. Jobs are finished the way the job-result processor does it (status,
 * then the engine), since no worker runs here.
 *
 * Two workflows that follow each other would loop forever; the chain must
 * stop at the third hop.
 */
describe('Project event triggers (e2e)', () => {
  jest.setTimeout(120_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let runner: WorkflowRunnerService;
  let headers: Record<string, string>;
  const ids = { workspaceIds: [] as string[], userIds: [] as string[] };

  let projectId: string;
  const bindings: Record<'recon' | 'followUp' | 'newAssets', string> = {
    recon: '',
    followUp: '',
    newAssets: '',
  };
  const stamp = Date.now();

  async function addTarget(workspaceId: string, value: string): Promise<Asset> {
    const target = await dataSource.getRepository(Target).save({
      value,
      type: TargetType.DOMAIN,
      source: TargetSource.MANUAL,
      workspaceId,
      lastDiscoveredAt: new Date(),
      reScanCount: 0,
    });
    return dataSource.getRepository(Asset).save({
      value,
      targetId: target.id,
      isPrimary: true,
      isEnabled: true,
    });
  }

  const runsOf = (bindingId: string): Promise<RunRow[]> =>
    dataSource.query(
      `SELECT id, "projectWorkflowId", "jobRunType", "triggerId", "causedByRunId",
              "chainDepth", scope
         FROM job_histories WHERE "projectWorkflowId" = $1 ORDER BY "createdAt"`,
      [bindingId],
    );

  /** Waits for the run of a workflow that `causedBy` started. */
  async function runCausedBy(
    bindingId: string,
    causedBy: string | null,
    timeoutMs = 20_000,
  ): Promise<RunRow> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const run = (await runsOf(bindingId)).find(
        (row) => row.causedByRunId === causedBy && row.jobRunType === 'event',
      );
      if (run) return run;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`No run of ${bindingId} caused by ${causedBy}`);
  }

  /** Finishes every job of a run, as the job-result processor would. */
  async function finishRun(runId: string): Promise<void> {
    const jobs: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM jobs WHERE "jobHistoryId" = $1`,
      [runId],
    );
    expect(jobs.length).toBeGreaterThan(0);
    await dataSource.query(
      `UPDATE jobs SET status = $2, "completedAt" = now() WHERE "jobHistoryId" = $1`,
      [runId, JobStatus.COMPLETED],
    );
    for (const job of jobs) {
      await runner.onJobTerminal({ id: job.id, jobHistory: { id: runId } } as unknown as Job);
    }
    const [{ isCompleted }]: Array<{ isCompleted: boolean }> = await dataSource.query(
      `SELECT "isCompleted" FROM job_histories WHERE id = $1`,
      [runId],
    );
    expect(isCompleted).toBe(true);
  }

  /** `on` of a workflow that runs after another, right away. */
  const after = (workflow: string) => ({
    events: [
      { event: 'project.run.completed', workflows: [workflow], windowMinutes: 0 },
    ],
  });

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;
    runner = app.app.get(WorkflowRunnerService);

    const owner = await createUserWithWorkspace(server, 'event-triggers');
    headers = owner.headers;
    ids.workspaceIds.push(owner.workspace.id);
    ids.userIds.push(owner.user.id);

    const asset = await addTarget(owner.workspace.id, `e2e-chain-${stamp}.example.com`);
    const [{ id: subfinder }]: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM tools WHERE name = 'subfinder' LIMIT 1`,
    );
    const tools = [{ toolId: subfinder }];

    const created = await request(server)
      .post('/api/projects')
      .set(headers)
      .send({
        name: `E2E chain ${stamp}`,
        hostIds: [asset.id],
        autoAddAssets: false,
        workflowName: 'Recon',
        tools,
        on: after('Follow-up'),
      })
      .expect(201);
    projectId = (created.body as { id: string }).id;

    const project = await request(server)
      .get(`/api/projects/${projectId}`)
      .set(headers)
      .expect(200);
    bindings.recon = (project.body as { projectWorkflows: Array<{ id: string }> })
      .projectWorkflows[0].id;

    const followUp = await request(server)
      .post(`/api/projects/${projectId}/workflows`)
      .set(headers)
      .send({ name: 'Follow-up', tools, on: after('Recon') })
      .expect(201);
    bindings.followUp = (followUp.body as { id: string }).id;

    const newAssets = await request(server)
      .post(`/api/projects/${projectId}/workflows`)
      .set(headers)
      .send({
        name: 'New assets',
        tools,
        on: { events: [{ event: 'project.assets.added', windowMinutes: 0 }] },
      })
      .expect(201);
    bindings.newAssets = (newAssets.body as { id: string }).id;
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query(
        `DELETE FROM job_histories WHERE "projectId" = $1`,
        [projectId],
      );
      await cleanupE2eData(dataSource, ids);
    }
    await closeTestApp(app?.app);
  });

  it('writes each event trigger into the workflow file', async () => {
    const [{ on }]: Array<{ on: Record<string, unknown> }> = await dataSource.query(
      `SELECT w.content->'on' AS on FROM project_workflows pw
         JOIN workflows w ON w.id = pw."workflowId" WHERE pw.id = $1`,
      [bindings.followUp],
    );
    expect(on).toEqual({
      'project.run.completed': {
        windowMinutes: 0,
        maxAssets: 200,
        targetTypes: [],
        workflows: ['Recon'],
        status: ['success'],
      },
    });
  });

  it('runs on the assets that join the project, and only on them', async () => {
    const added = await addTarget(ids.workspaceIds[0], `e2e-added-${stamp}.example.com`);

    await request(server)
      .post(`/api/projects/${projectId}/assets`)
      .set(headers)
      .send({ assetIds: [added.id] })
      .expect(201);

    // Picked by hand: nothing ran before it.
    const run = await runCausedBy(bindings.newAssets, null);
    expect(run.scope?.assetIds).toEqual([added.id]);
    expect(run.chainDepth).toBe(0);
    expect(run.triggerId).toBeTruthy();
  });

  it('starts a workflow after another, and stops two that follow each other', async () => {
    const manual = await request(server)
      .post(`/api/projects/${projectId}/workflows/${bindings.recon}/run`)
      .set(headers)
      .send({})
      .expect(201);
    const first = (manual.body as { jobHistoryId: string }).jobHistoryId;

    // Recon (0) → Follow-up (1) → Recon (2) → Follow-up (3) → stop.
    const chain = [first];
    const order = [bindings.followUp, bindings.recon, bindings.followUp];
    for (const [hop, bindingId] of order.entries()) {
      await finishRun(chain[hop]);
      const next = await runCausedBy(bindingId, chain[hop]);
      expect(next.chainDepth).toBe(hop + 1);
      chain.push(next.id);
    }

    await finishRun(chain[3]);
    // The fourth hop would be past the limit: give the lane time to (not) act.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const caused = await dataSource.query(
      `SELECT id FROM job_histories WHERE "causedByRunId" = $1`,
      [chain[3]],
    );
    expect(caused).toEqual([]);

    const runs = await request(server)
      .get(`/api/projects/${projectId}/runs`)
      .query({ projectWorkflowId: bindings.followUp })
      .set(headers)
      .expect(200);
    const latest = (runs.body as { data: Array<Record<string, unknown>> }).data[0];
    expect(latest).toMatchObject({
      id: chain[3],
      triggerType: 'event',
      triggerEvent: 'project.run.completed',
      causedByRunId: chain[2],
      causedByWorkflowName: 'Recon',
    });
  });
});
