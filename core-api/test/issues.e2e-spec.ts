import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';
import { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import { Asset } from '@/modules/assets/entities/assets.entity';
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

interface IssueBody {
  id: string;
  no: number;
  type: string;
  status: string;
  resolution: string | null;
  progress: { done: number; total: number } | null;
  links?: Array<{ id: string; resourceType: string; resource: Record<string, unknown> }>;
}

/**
 * Generic issues over real HTTP and the real event bridge: numbering, typed
 * links, status rules, shared comments (issue + vulnerability subjects with
 * the exclusive-arc CHECK), tenant isolation, default rules, and the
 * remediation handler resolving/reopening an issue from `vulnerability.fixed`
 * / `vulnerability.resurfaced` events.
 */
describe('Issues (e2e)', () => {
  jest.setTimeout(120_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let bridge: EventBridgeService;
  let headers: Record<string, string>;
  let otherHeaders: Record<string, string>;
  let workspaceId: string;
  const ids = { workspaceIds: [] as string[], userIds: [] as string[] };
  const stamp = Date.now();
  let assetId: string;
  let targetId: string;
  const vulnIds: string[] = [];

  async function insertVulnerability(name: string, severity: string): Promise<string> {
    const [{ id }]: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO vulnerabilities (name, severity, "assetId", fingerprint, "detectionStatus",
                                    "firstDetectedDate", "lastSeenDate")
       VALUES ($1, $2, $3, $4, 'active', now(), now()) RETURNING id`,
      [name, severity, assetId, `e2e-issues-${stamp}-${name}`],
    );
    return id;
  }

  async function waitFor<T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 20_000): Promise<T> {
    const deadline = Date.now() + ms;
    let last = await read();
    while (!done(last) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      last = await read();
    }
    return last;
  }

  const getIssue = async (id: string): Promise<IssueBody> =>
    (await request(server).get(`/api/issues/${id}`).set(headers).expect(200)).body as IssueBody;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;
    bridge = app.app.get(EventBridgeService);

    const owner = await createUserWithWorkspace(server, 'issues');
    headers = owner.headers;
    workspaceId = owner.workspace.id;
    ids.workspaceIds.push(owner.workspace.id);
    ids.userIds.push(owner.user.userId);

    const other = await createUserWithWorkspace(server, 'issues-other');
    otherHeaders = other.headers;
    ids.workspaceIds.push(other.workspace.id);
    ids.userIds.push(other.user.userId);

    const target = await dataSource.getRepository(Target).save({
      value: `e2e-issues-${stamp}.invalid`,
      type: TargetType.DOMAIN,
      source: TargetSource.MANUAL,
      workspaceId,
      lastDiscoveredAt: new Date(),
      reScanCount: 0,
    });
    targetId = target.id;
    const asset = await dataSource.getRepository(Asset).save({
      value: `e2e-issues-${stamp}.invalid`,
      targetId: target.id,
      isPrimary: true,
      isEnabled: true,
    });
    assetId = asset.id;
    vulnIds.push(await insertVulnerability('E2E HTTP/2 Rapid Reset', 'high'));
    vulnIds.push(await insertVulnerability('E2E Exposed git', 'critical'));
  });

  afterAll(async () => {
    if (dataSource) await cleanupE2eData(dataSource, ids);
    await closeTestApp(app?.app);
  });

  it('numbers issues per workspace and defaults to a task', async () => {
    const a = await request(server).post('/api/issues').set(headers).send({ title: 'First' }).expect(201);
    const b = await request(server).post('/api/issues').set(headers).send({ title: 'Second' }).expect(201);
    const first = a.body as IssueBody;
    const second = b.body as IssueBody;
    expect(first.type).toBe('task');
    expect(first.progress).toBeNull();
    expect(second.no).toBe(first.no + 1);
  });

  it('never reuses the number of a deleted issue', async () => {
    const created = await request(server).post('/api/issues').set(headers).send({ title: 'Newest' }).expect(201);
    const newest = created.body as IssueBody;
    await request(server).delete(`/api/issues/${newest.id}`).set(headers).expect(200);
    const next = await request(server).post('/api/issues').set(headers).send({ title: 'After delete' }).expect(201);
    expect((next.body as IssueBody).no).toBe(newest.no + 1);
  });

  it('links vulnerabilities and reports remediation progress', async () => {
    const res = await request(server)
      .post('/api/issues')
      .set(headers)
      .send({
        title: 'Patch edge',
        type: 'vulnerability_remediation',
        priority: 'p2',
        links: vulnIds.map((resourceId) => ({ resourceType: 'vulnerability', resourceId })),
      })
      .expect(201);
    const issue = res.body as IssueBody;
    expect(issue.progress).toEqual({ done: 0, total: 2 });
    expect(issue.links).toHaveLength(2);
    expect(issue.links?.[0].resource).toMatchObject({ assetValue: expect.any(String) });

    const listed = await request(server)
      .get('/api/issues')
      .query({ type: ['vulnerability_remediation'] })
      .set(headers)
      .expect(200);
    const data = (listed.body as { data: IssueBody[] }).data;
    expect(data.map((i) => i.id)).toContain(issue.id);
    expect(data.every((i) => i.type === 'vulnerability_remediation')).toBe(true);
  });

  it('rejects links to resources of another workspace', async () => {
    const res = await request(server)
      .post('/api/issues')
      .set(otherHeaders)
      .send({
        title: 'Steal',
        type: 'vulnerability_remediation',
        links: [{ resourceType: 'vulnerability', resourceId: vulnIds[0] }],
      });
    expect([400, 404]).toContain(res.status);
  });

  it('requires a resolution to resolve and writes a system comment', async () => {
    const created = (
      await request(server).post('/api/issues').set(headers).send({ title: 'Resolve me' }).expect(201)
    ).body as IssueBody;

    await request(server)
      .patch(`/api/issues/${created.id}/status`)
      .set(headers)
      .send({ status: 'resolved' })
      .expect(400);
    await request(server)
      .patch(`/api/issues/${created.id}/status`)
      .set(headers)
      .send({ status: 'resolved', resolution: 'fixed' })
      .expect(200);

    const issue = await getIssue(created.id);
    expect(issue.status).toBe('resolved');
    expect(issue.resolution).toBe('fixed');

    const comments = await request(server)
      .get(`/api/issues/${created.id}/comments`)
      .set(headers)
      .expect(200);
    const rows = (comments.body as { data: Array<{ type: string; isCanEdit: boolean }> }).data;
    expect(rows.some((c) => c.type !== 'content' && c.isCanEdit === false)).toBe(true);
  });

  it('comments on issues and vulnerabilities, isolated per tenant', async () => {
    const issue = (
      await request(server).post('/api/issues').set(headers).send({ title: 'Talk' }).expect(201)
    ).body as IssueBody;

    const posted = await request(server)
      .post(`/api/issues/${issue.id}/comments`)
      .set(headers)
      .send({ content: 'Upgraded nginx on gw' })
      .expect(201);
    const commentId = (posted.body as { id: string }).id;

    await request(server)
      .post(`/api/vulnerabilities/${vulnIds[0]}/comments`)
      .set(headers)
      .send({ content: 'Scheduled for Friday' })
      .expect(201);
    const vulnComments = await request(server)
      .get(`/api/vulnerabilities/${vulnIds[0]}/comments`)
      .set(headers)
      .expect(200);
    expect((vulnComments.body as { data: unknown[] }).data).toHaveLength(1);

    const [{ subjects }]: Array<{ subjects: number }> = await dataSource.query(
      `SELECT count(*)::int AS subjects FROM comments
        WHERE ("issueId" IS NOT NULL) AND ("vulnerabilityId" IS NOT NULL)`,
    );
    expect(subjects).toBe(0);

    await request(server).get(`/api/issues/${issue.id}/comments`).set(otherHeaders).expect(404);
    await request(server)
      .get(`/api/vulnerabilities/${vulnIds[0]}/comments`)
      .set(otherHeaders)
      .expect(404);
    await request(server)
      .patch(`/api/comments/${commentId}`)
      .set(otherHeaders)
      .send({ content: 'hijack' })
      .expect((res) => expect([403, 404]).toContain(res.status));
  });

  it('creates the default rule once', async () => {
    const first = await request(server).post('/api/issues/rules/defaults').set(headers);
    expect([200, 201]).toContain(first.status);
    const second = await request(server).post('/api/issues/rules/defaults').set(headers);
    expect([200, 201]).toContain(second.status);
    const rules = await request(server).get('/api/issues/rules').set(headers).expect(200);
    const list = rules.body as Array<{ event: string; issueType: string }>;
    expect(list.filter((r) => r.event === 'vulnerability.detected')).toHaveLength(1);
  });

  it('auto-resolves when every linked finding is fixed and reopens on resurface', async () => {
    const issue = (
      await request(server)
        .post('/api/issues')
        .set(headers)
        .send({
          title: 'Auto',
          type: 'vulnerability_remediation',
          links: [{ resourceType: 'vulnerability', resourceId: vulnIds[1] }],
        })
        .expect(201)
    ).body as IssueBody;

    await dataSource.query(
      `UPDATE vulnerabilities SET "detectionStatus" = 'fixed', "fixedAt" = now() WHERE id = $1`,
      [vulnIds[1]],
    );
    await bridge.publishSafely(EVENT_CATALOG.vulnerability.fixed, {
      workspaceId,
      outcome: 'success',
      resourceType: 'vulnerability',
      payload: { vulnerabilityIds: [vulnIds[1]], assetId, targetId },
    });
    const resolved = await waitFor(() => getIssue(issue.id), (i) => i.status === 'resolved');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toBe('fixed');
    expect(resolved.progress).toEqual({ done: 1, total: 1 });

    await dataSource.query(
      `UPDATE vulnerabilities SET "detectionStatus" = 'resurfaced', "fixedAt" = NULL WHERE id = $1`,
      [vulnIds[1]],
    );
    await bridge.publishSafely(EVENT_CATALOG.vulnerability.resurfaced, {
      workspaceId,
      outcome: 'success',
      resourceType: 'vulnerability',
      payload: {
        targetId,
        assetId,
        assetValue: `e2e-issues-${stamp}.invalid`,
        vulnerabilities: [{ id: vulnIds[1], name: 'E2E Exposed git', severity: 'critical' }],
      },
    });
    const reopened = await waitFor(() => getIssue(issue.id), (i) => i.status === 'open');
    expect(reopened.status).toBe('open');
    expect(reopened.resolution).toBeNull();
  });

  it('keeps issues of another workspace invisible', async () => {
    const mine = await request(server).get('/api/issues').set(headers).expect(200);
    const id = (mine.body as { data: IssueBody[] }).data[0].id;
    await request(server).get(`/api/issues/${id}`).set(otherHeaders).expect(404);
  });
});
