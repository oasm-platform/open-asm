import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { cleanupE2eData, createUser, createUserWithWorkspace } from './helpers/workspace';
import { wsHeaders } from './helpers/auth';
import { ReportRunner } from '../src/modules/reports/report-runner';
import { ReportsService } from '../src/modules/reports/reports.service';
import { BUILTIN_TEMPLATES } from '../src/modules/reports/templates/registry';
import { AsqError } from '../src/modules/attack-surface-query/domain/query-errors';
import type { QueryScope } from '../src/modules/attack-surface-query/domain/query.types';

/**
 * The builtin SUMMARY and VULNERABILITY templates against real Postgres: the
 * numbers the PDFs render, tenant isolation, the catalog read keys and what a
 * failing query leaves behind. `@react-pdf/renderer` is a stub in the e2e
 * config, so the checks sit on the data `ReportRunner.run` returns.
 */
describe('Builtin report templates (e2e)', () => {
  jest.setTimeout(180_000);

  const DAY = 86_400_000;
  const HOUR = 3_600_000;

  let app: TestApp;
  let dataSource: DataSource;
  let runner: ReportRunner;
  let reports: ReportsService;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  // Anchors: every seeded timestamp is relative to these, so "this week",
  // "last week" and the 30-day trend do not depend on the day the spec runs.
  // `weekStart` is Monday 00:00 local, as `report-header.ts` computes it.
  const startedAt = new Date();
  const weekStart = (() => {
    const d = new Date(startedAt);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const span = startedAt.getTime() - weekStart.getTime();
  const at = (ms: number) => new Date(ms);
  /** Strictly inside [weekStart, now], whatever the day. */
  const THIS = at(weekStart.getTime() + span / 2);
  const THIS_EARLIER = at(weekStart.getTime() + span / 4);
  /** Inside last week W = [weekStart - 7d, weekStart]. */
  const LAST_WEEK = at(weekStart.getTime() - 3 * DAY);
  const LAST_WEEK_EARLIER = at(LAST_WEEK.getTime() - HOUR);
  /** Before last week, still inside the 30-day trend window. */
  const OLD = at(weekStart.getTime() - 20 * DAY);
  const OLD_EARLIER = at(OLD.getTime() - HOUR);
  /** Beyond the trend window: created "last month". */
  const LAST_MONTH = at(startedAt.getTime() - 45 * DAY);

  const one = async (sql: string, params: unknown[]): Promise<string> => {
    const rows: Array<{ id: string }> = await dataSource.query(sql, params);
    return rows[0].id;
  };
  const iso = (d: Date) => d.toISOString();

  interface Seeded {
    workspaceId: string;
    domain: string;
    ipTarget: string;
    s443Value: string;
    h1Value: string;
    h2Value: string;
    h3Value: string;
    vulnIds: Record<string, string>;
  }
  let A: Seeded;
  let B: Seeded;
  let emptyWorkspaceId: string;
  let ownerA: { userId: string; cookie: string; headers: Record<string, string> };
  let memberCookie: string;

  async function seedTarget(workspaceId: string, value: string, type: string, createdAt: Date): Promise<string> {
    return one(
      `INSERT INTO targets (value, "workspaceId", type, "createdAt") VALUES ($1, $2, $3, $4::timestamp) RETURNING id`,
      [value, workspaceId, type, iso(createdAt)],
    );
  }
  async function seedHost(targetId: string, value: string, createdAt: Date): Promise<string> {
    return one(
      `INSERT INTO assets (value, "targetId", "createdAt") VALUES ($1, $2, $3::timestamp) RETURNING id`,
      [value, targetId, iso(createdAt)],
    );
  }
  async function seedService(hostId: string, value: string, port: number, createdAt: Date): Promise<string> {
    return one(
      `INSERT INTO asset_services (value, port, "assetId", "createdAt") VALUES ($1, $2, $3, $4::timestamp) RETURNING id`,
      [value, port, hostId, iso(createdAt)],
    );
  }
  interface VulnSeed {
    key: string;
    name: string;
    severity: string;
    host: string;
    createdAt: Date;
    cvss?: number | null;
    ports?: string[];
    detectionStatus?: string;
    reviewStatus?: string;
    analyzeStatus?: string;
    description?: string;
  }
  async function seedVuln(label: string, v: VulnSeed): Promise<string> {
    return one(
      `INSERT INTO vulnerabilities (name, severity, "assetId", "cvssScore", ports, "detectionStatus", "reviewStatus", "analyzeStatus", description, "createdAt", fingerprint)
       VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9, $10::timestamp, $11) RETURNING id`,
      [
        v.name, v.severity, v.host, v.cvss ?? null, v.ports ?? null, v.detectionStatus ?? 'active',
        v.reviewStatus ?? 'approved', v.analyzeStatus ?? 'not_analyzed', v.description ?? null, iso(v.createdAt),
        `fp-${label}-${v.key}-${randomUUID()}`,
      ],
    );
  }
  async function dismiss(vulnId: string, userId: string, expiresAt: Date | null): Promise<void> {
    await dataSource.query(
      `INSERT INTO vulnerability_dismissals ("vulnerabilityId", "userId", reason, "expiresAt") VALUES ($1, $2, 'false_positive', $3)`,
      [vulnId, userId, expiresAt ? iso(expiresAt) : null],
    );
  }

  /**
   * Workspace A (see the numbers in the assertions below):
   *   targets   DOMAIN (this week), IP (last month), GIT_ORG (last week)
   *   hosts     h1 (DOMAIN, this week), h2 (DOMAIN, last week), h3 (IP target, last month),
   *             plus a repository asset under GIT_ORG (last week) that no count may include
   *   services  443 on h1 (this week), 80 on h2 (last month), 22 on h3 (last week)
   *   tags      `nginx` on the 443 service (this week), `web` on the 80 service (last month)
   *   findings  see `vulns` below
   */
  async function seedA(workspaceId: string, userId: string): Promise<Seeded> {
    const label = 'repA';
    const domain = `repa-${randomUUID()}.example.com`;
    const domainTarget = await seedTarget(workspaceId, domain, 'DOMAIN', THIS);
    const ipTarget = `10.${Math.floor(Math.random() * 200)}.0.9`;
    const ipTargetId = await seedTarget(workspaceId, ipTarget, 'IP', LAST_MONTH);
    const orgTarget = await seedTarget(workspaceId, `https://github.com/${label}-${randomUUID()}`, 'GIT_ORG', LAST_WEEK);

    const h1Value = `h1.${domain}`;
    const h2Value = `h2.${domain}`;
    const h3Value = ipTarget;
    const h1 = await seedHost(domainTarget, h1Value, THIS);
    const h2 = await seedHost(domainTarget, h2Value, LAST_WEEK);
    const h3 = await seedHost(ipTargetId, h3Value, LAST_MONTH);
    await seedHost(orgTarget, `https://github.com/${label}/repo`, LAST_WEEK);

    const s443Value = `${h1Value}:443`;
    const s443 = await seedService(h1, s443Value, 443, THIS);
    const s80 = await seedService(h2, `${h2Value}:80`, 80, LAST_MONTH);
    await seedService(h3, `${h3Value}:22`, 22, LAST_WEEK);
    await dataSource.query(
      `INSERT INTO asset_services_tags (tag, "assetServiceId", "createdAt") VALUES ('nginx', $1, $2::timestamp), ('web', $3, $4::timestamp)`,
      [s443, iso(THIS), s80, iso(LAST_MONTH)],
    );

    const vulns: VulnSeed[] = [
      // open
      { key: 'crit', name: 'Crit RCE', severity: 'critical', host: h1, createdAt: THIS, cvss: 9, ports: ['443', '80'], analyzeStatus: 'done', description: 'd'.repeat(3000) },
      { key: 'high', name: 'High SQLi', severity: 'high', host: h1, createdAt: THIS_EARLIER, cvss: 8, ports: ['443'] },
      { key: 'med', name: 'Med XSS', severity: 'medium', host: h2, createdAt: LAST_WEEK, cvss: 5, analyzeStatus: 'done' },
      { key: 'low', name: 'Low Banner', severity: 'low', host: h3, createdAt: LAST_WEEK_EARLIER, cvss: 2 },
      { key: 'info', name: 'Info Header', severity: 'info', host: h3, createdAt: OLD, cvss: 0 },
      { key: 'nocvss', name: 'Med NoCvss', severity: 'medium', host: h3, createdAt: OLD_EARLIER, cvss: null },
      { key: 'expired', name: 'Expired Dismissal', severity: 'critical', host: h3, createdAt: OLD, cvss: 10 },
      // not open
      { key: 'dismissed', name: 'Dismissed', severity: 'high', host: h1, createdAt: THIS, cvss: 7, ports: ['443'] },
      { key: 'fixed', name: 'Fixed', severity: 'high', host: h2, createdAt: LAST_WEEK, cvss: 7.5, detectionStatus: 'fixed', analyzeStatus: 'done' },
      { key: 'pending', name: 'Pending Review', severity: 'critical', host: h1, createdAt: THIS, cvss: 9.9, reviewStatus: 'pending_review' },
    ];
    const vulnIds: Record<string, string> = {};
    for (const v of vulns) vulnIds[v.key] = await seedVuln(label, v);
    await dismiss(vulnIds.dismissed, userId, null);
    await dismiss(vulnIds.expired, userId, at(startedAt.getTime() - DAY));
    return { workspaceId, domain, ipTarget, s443Value, h1Value, h2Value, h3Value, vulnIds };
  }

  /** Other tenant: rows of every kind, all of them recent, so any leak shows in a count. */
  async function seedB(workspaceId: string): Promise<Seeded> {
    const domain = `repb-${randomUUID()}.example.com`;
    const target = await seedTarget(workspaceId, domain, 'DOMAIN', THIS);
    const host = await seedHost(target, `h.${domain}`, THIS);
    const service = await seedService(host, `h.${domain}:443`, 443, THIS);
    await dataSource.query(`INSERT INTO asset_services_tags (tag, "assetServiceId", "createdAt") VALUES ('b-tag', $1, $2::timestamp)`, [service, iso(THIS)]);
    const vulnIds: Record<string, string> = {};
    for (const [key, severity] of [['c', 'critical'], ['h', 'high']] as const) {
      vulnIds[key] = await seedVuln('repB', { key, name: `B ${severity}`, severity, host, createdAt: THIS, cvss: 9.5, ports: ['443'] });
    }
    return { workspaceId, domain, ipTarget: '', s443Value: '', h1Value: `h.${domain}`, h2Value: '', h3Value: '', vulnIds };
  }

  const scopeOf = (workspaceId: string, permissions: string[] = ['*']): QueryScope => ({
    workspaceId,
    permissions,
    caller: 'report',
  });

  const utcDay = (d: Date) => Math.floor(d.getTime() / DAY);
  /** Expected 31-point daily series from the seeded open findings (UTC buckets). */
  const expectedTrend = (createdAts: Date[]): number[] => {
    const series = new Array<number>(31).fill(0);
    for (const d of createdAts) series[30 - (utcDay(startedAt) - utcDay(d))] += 1;
    return series;
  };
  const OPEN_CREATED = [THIS, THIS_EARLIER, LAST_WEEK, LAST_WEEK_EARLIER, OLD, OLD_EARLIER, OLD];
  const formatDay = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.dataSource;
    runner = app.app.get(ReportRunner, { strict: false });
    reports = app.app.get(ReportsService, { strict: false });

    const a = await createUserWithWorkspace(app.server, 'rep-a');
    const b = await createUserWithWorkspace(app.server, 'rep-b');
    const c = await createUserWithWorkspace(app.server, 'rep-empty');
    workspaceIds.push(a.workspace.id, b.workspace.id, c.workspace.id);
    userIds.push(a.user.userId, b.user.userId, c.user.userId);
    ownerA = { userId: a.user.userId, cookie: a.user.cookie, headers: a.headers };
    emptyWorkspaceId = c.workspace.id;

    A = await seedA(a.workspace.id, a.user.userId);
    B = await seedB(b.workspace.id);

    // A member of A who may read and write reports and read targets and assets, but not vulnerabilities.
    const member = await createUser(app.server, { name: 'E2E report member' });
    userIds.push(member.userId);
    memberCookie = member.cookie;
    const memberRow = await one(`INSERT INTO workspace_members ("workspaceId", "userId") VALUES ($1, $2) RETURNING id`, [A.workspaceId, member.userId]);
    const group = await one(
      `INSERT INTO workspace_permissions ("workspaceId", name, permissions) VALUES ($1, 'reports-only', $2::text[]) RETURNING id`,
      [A.workspaceId, ['report.read', 'report.write', 'target.read', 'asset.read']],
    );
    await dataSource.query(`INSERT INTO workspace_member_permissions ("memberId", "permissionId") VALUES ($1, $2)`, [memberRow, group]);
  });

  afterAll(async () => {
    try {
      await cleanupE2eData(dataSource, { workspaceIds, userIds });
    } finally {
      await closeTestApp(app?.app);
    }
  });

  describe('summary', () => {
    it('renders the hand-computed numbers of workspace A and none of workspace B', async () => {
      const data = await runner.run(BUILTIN_TEMPLATES.summary, scopeOf(A.workspaceId), {});

      expect(data.workspaceName).toMatch(/^e2e-rep-a-/);
      // Targets 3 (the GIT_ORG one was created last week), hosts 3 (the repository asset is not a host), services 3.
      expect(data.weekly).toEqual({
        totalTargets: 3,
        targetsChange: 2,
        totalAssets: 3,
        assetsChange: 2,
        totalServices: 3,
        servicesChange: 2,
        // open: critical 2, high 1, medium 2, low 1 -> floor(100 - 30 - 7.5 - 4.1625 - 0.5) = 57 (critical caps at 69).
        securityScore: 57,
        // open created last week: medium 1, low 1 -> floor(100 - 2.25 - 0.5) = 97.
        scoreChange: 57 - 97,
      });

      expect(data.riskDistribution.map(({ level, count }) => [level, count])).toEqual([
        ['critical', 2],
        ['high', 1],
        ['medium', 2],
        ['low', 1],
      ]);
      // The 7 open findings (info included) are the denominator.
      expect(data.riskDistribution.map((r) => r.percent)).toEqual([
        expect.closeTo((2 / 7) * 100, 6),
        expect.closeTo((1 / 7) * 100, 6),
        expect.closeTo((2 / 7) * 100, 6),
        expect.closeTo((1 / 7) * 100, 6),
      ]);

      expect(data.vulnerabilityByTarget).toEqual([
        { target: A.ipTarget, type: 'IP', critical: 1, high: 0, medium: 1, low: 1, total: 4 },
        { target: A.domain, type: 'DOMAIN', critical: 1, high: 1, medium: 1, low: 0, total: 3 },
      ]);

      // Open, not info, newest first; a null CVSS renders as 0.
      expect(data.newFindings).toEqual([
        { title: 'Crit RCE', severity: 'critical', cvss: 9, asset: A.h1Value, discovered: formatDay(THIS) },
        { title: 'High SQLi', severity: 'high', cvss: 8, asset: A.h1Value, discovered: formatDay(THIS_EARLIER) },
        { title: 'Med XSS', severity: 'medium', cvss: 5, asset: A.h2Value, discovered: formatDay(LAST_WEEK) },
        { title: 'Low Banner', severity: 'low', cvss: 2, asset: A.h3Value, discovered: formatDay(LAST_WEEK_EARLIER) },
        { title: 'Expired Dismissal', severity: 'critical', cvss: 10, asset: A.h3Value, discovered: formatDay(OLD) },
        { title: 'Med NoCvss', severity: 'medium', cvss: 0, asset: A.h3Value, discovered: formatDay(OLD_EARLIER) },
      ]);

      expect(data.newDiscoveries).toEqual({
        // 3 open findings under the DOMAIN target -> medium.
        domains: [{ identifier: A.domain, discovered: formatDay(THIS), provider: 'OpenASM', riskLevel: 'medium' }],
        ipAddresses: [],
        // Two open findings list 443 on h1 (the dismissed one does not count) -> medium.
        ports: [{ port: 443, service: A.s443Value, discovered: formatDay(THIS), target: A.domain, riskLevel: 'medium' }],
        technologies: [{ name: 'nginx', discovered: formatDay(THIS), target: A.domain, category: 'Technology' }],
      });

      const trend = expectedTrend(OPEN_CREATED);
      expect(data.vulnerabilityTrends.last30Days).toEqual(trend);
      expect(data.vulnerabilityTrends.last7Days).toEqual(trend.slice(-8));
      expect(data.vulnerabilityTrends.avgPerWeek).toBe(Math.round((trend.slice(-8).reduce((s, n) => s + n, 0) / 7) * 10) / 10);
    });

    it('a workspace with no rows renders zeros, empty lists and percent 0', async () => {
      const data = await runner.run(BUILTIN_TEMPLATES.summary, scopeOf(emptyWorkspaceId), {});

      expect(data.weekly).toEqual({
        totalTargets: 0, targetsChange: 0, totalAssets: 0, assetsChange: 0, totalServices: 0, servicesChange: 0,
        securityScore: 100, scoreChange: 0,
      });
      expect(data.riskDistribution.map((r) => r.percent)).toEqual([0, 0, 0, 0]);
      expect(data.riskDistribution.map((r) => r.count)).toEqual([0, 0, 0, 0]);
      expect(data.vulnerabilityByTarget).toEqual([]);
      expect(data.newFindings).toEqual([]);
      expect(data.newDiscoveries).toEqual({ domains: [], ipAddresses: [], ports: [], technologies: [] });
      expect(data.vulnerabilityTrends.last30Days).toEqual(new Array<number>(31).fill(0));
      expect(data.vulnerabilityTrends.last7Days).toEqual(new Array<number>(8).fill(0));
    });

    it('keeps the user filters: targetIds narrow the findings but not the asset totals', async () => {
      const [{ id: domainTargetId }] = await dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM targets WHERE "workspaceId" = $1 AND value = $2`,
        [A.workspaceId, A.domain],
      );
      const data = await runner.run(BUILTIN_TEMPLATES.summary, scopeOf(A.workspaceId), { targetIds: [domainTargetId] });

      expect(data.vulnerabilityByTarget).toEqual([
        { target: A.domain, type: 'DOMAIN', critical: 1, high: 1, medium: 1, low: 0, total: 3 },
      ]);
      expect(data.newFindings.map((f) => f.title)).toEqual(['Crit RCE', 'High SQLi', 'Med XSS']);
      // Today's counts ignore the targets filter.
      expect(data.weekly.totalTargets).toBe(3);
    });
  });

  describe('vulnerability', () => {
    it('renders the hand-computed numbers of workspace A and none of workspace B', async () => {
      const data = await runner.run(BUILTIN_TEMPLATES.vulnerability, scopeOf(A.workspaceId), {});

      expect(data.workspaceName).toMatch(/^e2e-rep-a-/);
      expect(data.summary).toEqual({
        totalVulnerabilities: 7,
        criticalCount: 2,
        highCount: 1,
        mediumCount: 2,
        lowCount: 1,
        infoCount: 1,
        // Only the actively dismissed one: the expired dismissal is open again, the fixed one is excluded.
        dismissedCount: 1,
        activeCount: 6,
        // (9 + 8 + 5 + 2 + 0 + 10) / 6 = 5.67 over the open findings with a CVSS score.
        avgCvssScore: 5.7,
      });
      expect(data.severityDistribution.map((d) => [d.level, d.count])).toEqual([
        ['critical', 2], ['high', 1], ['medium', 2], ['low', 1], ['info', 1],
      ]);
      expect(data.severityDistribution.map((d) => d.percent)).toEqual([
        expect.closeTo((2 / 7) * 100, 6), expect.closeTo((1 / 7) * 100, 6), expect.closeTo((2 / 7) * 100, 6),
        expect.closeTo((1 / 7) * 100, 6), expect.closeTo((1 / 7) * 100, 6),
      ]);
      // `done` on the open findings only (the fixed one is `done` too).
      expect(data.analyzeStats).toEqual({ done: 2 });

      expect(data.topAssets).toEqual([
        { asset: A.h3Value, total: 4, critical: 1, high: 0, medium: 1, low: 1, info: 1 },
        { asset: A.h1Value, total: 2, critical: 1, high: 1, medium: 0, low: 0, info: 0 },
        { asset: A.h2Value, total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 },
      ]);
      expect(data.targetStats).toEqual([
        { target: A.ipTarget, type: 'IP', total: 4, critical: 1, high: 0, medium: 1, low: 1, info: 1 },
        { target: A.domain, type: 'DOMAIN', total: 3, critical: 1, high: 1, medium: 1, low: 0, info: 0 },
      ]);

      // Open, not info, critical -> low, then CVSS descending; a null CVSS is 0.
      expect(data.allVulnerabilities.map((v) => [v.name, v.severity, v.cvssScore, v.asset])).toEqual([
        ['Expired Dismissal', 'critical', 10, A.h3Value],
        ['Crit RCE', 'critical', 9, A.h1Value],
        ['High SQLi', 'high', 8, A.h1Value],
        ['Med XSS', 'medium', 5, A.h2Value],
        ['Med NoCvss', 'medium', 0, A.h3Value],
        ['Low Banner', 'low', 2, A.h3Value],
      ]);
      // Long text reaches the document uncut (the old service cut at 2000).
      expect(data.allVulnerabilities.find((v) => v.name === 'Crit RCE')?.description).toHaveLength(3000);

      const trend = expectedTrend(OPEN_CREATED);
      expect(data.vulnerabilityTrends.last30Days).toEqual(trend);
      expect(data.vulnerabilityTrends.last7Days).toEqual(trend.slice(-8));
    });

    it('applies minSeverity and vulnIds on the list, the counts and the dismissed total', async () => {
      const data = await runner.run(BUILTIN_TEMPLATES.vulnerability, scopeOf(A.workspaceId), { minSeverity: 'HIGH' });

      expect(data.summary).toMatchObject({ totalVulnerabilities: 3, criticalCount: 2, highCount: 1, mediumCount: 0, infoCount: 0, dismissedCount: 1 });
      expect(data.allVulnerabilities.map((v) => v.name)).toEqual(['Expired Dismissal', 'Crit RCE', 'High SQLi']);

      const picked = await runner.run(BUILTIN_TEMPLATES.vulnerability, scopeOf(A.workspaceId), {
        vulnIds: [A.vulnIds.med, A.vulnIds.low, B.vulnIds.c],
      });
      expect(picked.allVulnerabilities.map((v) => v.name)).toEqual(['Med XSS', 'Low Banner']);
      expect(picked.summary.totalVulnerabilities).toBe(2);
    });

    it('a workspace with no rows renders zeros, empty lists and percent 0', async () => {
      const data = await runner.run(BUILTIN_TEMPLATES.vulnerability, scopeOf(emptyWorkspaceId), {});

      expect(data.summary).toEqual({
        totalVulnerabilities: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, infoCount: 0,
        dismissedCount: 0, activeCount: 0, avgCvssScore: 0,
      });
      expect(data.severityDistribution.map((d) => d.percent)).toEqual([0, 0, 0, 0, 0]);
      expect(data.topAssets).toEqual([]);
      expect(data.targetStats).toEqual([]);
      expect(data.allVulnerabilities).toEqual([]);
      expect(data.analyzeStats).toEqual({ done: 0 });
      expect(data.vulnerabilityTrends.last30Days).toEqual(new Array<number>(31).fill(0));
      expect(data.vulnerabilityTrends.last7Days).toEqual(new Array<number>(8).fill(0));
    });

    it('runs with 500 target ids and refuses 1001 with INVALID_QUERY', async () => {
      const ids = Array.from({ length: 500 }, () => randomUUID());
      const ok = await runner.run(BUILTIN_TEMPLATES.vulnerability, scopeOf(A.workspaceId), { targetIds: ids });
      expect(ok.summary.totalVulnerabilities).toBe(0);

      const tooMany = Array.from({ length: 1001 }, () => randomUUID());
      await expect(
        runner.run(BUILTIN_TEMPLATES.vulnerability, scopeOf(A.workspaceId), { targetIds: tooMany }),
      ).rejects.toMatchObject({ code: 'INVALID_QUERY', status: 400 });
    });
  });

  describe('permissions and failures over HTTP', () => {
    const countReports = async (workspaceId: string): Promise<number> =>
      Number((await dataSource.query<Array<{ n: string }>>(`SELECT count(*) AS n FROM reports WHERE "workspaceId" = $1`, [workspaceId]))[0].n);

    it('the owner can preview the vulnerability report', async () => {
      const res = await request(app.server).get('/api/reports/preview/vulnerability').set(ownerA.headers).expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('a member with report.read but no vulnerability.read gets 403 on preview and generate, and nothing is stored', async () => {
      const headers = wsHeaders(memberCookie, A.workspaceId);
      const before = await countReports(A.workspaceId);

      const preview = await request(app.server).get('/api/reports/preview/vulnerability').set(headers).expect(403);
      expect((preview.body as { error: { code: string } }).error.code).toBe('PERMISSION_DENIED');
      const generate = await request(app.server).post('/api/reports/generate/vulnerability').set(headers).send({}).expect(403);
      expect((generate.body as { error: { code: string } }).error.code).toBe('PERMISSION_DENIED');

      expect(await countReports(A.workspaceId)).toBe(before);
    });

    it('a member without vulnerability.read cannot run the summary either', async () => {
      await request(app.server).get('/api/reports/preview/summary').set(wsHeaders(memberCookie, A.workspaceId)).expect(403);
    });

    it('a query that fails stores no report: 400 INVALID_QUERY, no row', async () => {
      const before = await countReports(A.workspaceId);
      const targetIds = Array.from({ length: 1001 }, () => randomUUID());

      const res = await request(app.server)
        .post('/api/reports/generate/vulnerability')
        .set(ownerA.headers)
        .send({ targetIds })
        .expect(400);
      expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_QUERY');

      await expect(
        reports.generateReport(scopeOf(A.workspaceId), ownerA.userId, 'SUMMARY', { targetIds }),
      ).rejects.toBeInstanceOf(AsqError);
      expect(await countReports(A.workspaceId)).toBe(before);
    });
  });
});
