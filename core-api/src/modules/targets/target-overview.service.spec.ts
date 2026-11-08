import { CronSchedule, JobStatus } from '@/common/enums/enum';
import { NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { DataSource, Repository } from 'typeorm';
import {
  type GetTargetChangesQueryDto,
  InsightLevel,
  TargetChangeKind,
  TargetInsightKind,
} from './dto/target-overview.dto';
import type { Target } from './entities/target.entity';
import {
  buildTargetInsights,
  TargetOverviewService,
  toSeverityCounts,
} from './target-overview.service';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7);

describe('buildTargetInsights', () => {
  const base = {
    openCritical: 0,
    tlsExpiring: 0,
    newAssets: 0,
    lastRun: null,
    lastDiscoveredAt: new Date(NOW - DAY),
    scanSchedule: CronSchedule.DAILY,
    now: NOW,
  };

  it('returns nothing for a healthy, scheduled target', () => {
    expect(buildTargetInsights(base)).toEqual([]);
  });

  it('puts open critical vulnerabilities first, then warnings, then info', () => {
    const kinds = buildTargetInsights({
      ...base,
      openCritical: 2,
      tlsExpiring: 1,
      newAssets: 3,
      lastRun: { id: 'run-1', status: JobStatus.FAILED },
      lastDiscoveredAt: new Date(NOW - 45 * DAY),
      scanSchedule: CronSchedule.DISABLED,
    }).map((insight) => [insight.kind, insight.level]);
    expect(kinds).toEqual([
      [TargetInsightKind.CRITICAL_OPEN, InsightLevel.CRITICAL],
      [TargetInsightKind.LAST_RUN_FAILED, InsightLevel.WARNING],
      [TargetInsightKind.TLS_EXPIRING, InsightLevel.WARNING],
      [TargetInsightKind.STALE_SCAN, InsightLevel.WARNING],
      [TargetInsightKind.NEW_ASSETS, InsightLevel.INFO],
      [TargetInsightKind.NO_SCHEDULE, InsightLevel.INFO],
    ]);
  });

  it('carries the counts, days and run the console links to', () => {
    const insights = buildTargetInsights({
      ...base,
      openCritical: 4,
      lastRun: { id: 'run-9', status: JobStatus.FAILED },
      lastDiscoveredAt: new Date(NOW - 31 * DAY),
    });
    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: TargetInsightKind.CRITICAL_OPEN, count: 4 }),
        expect.objectContaining({ kind: TargetInsightKind.LAST_RUN_FAILED, runId: 'run-9' }),
        expect.objectContaining({ kind: TargetInsightKind.STALE_SCAN, days: 31 }),
      ]),
    );
  });

  it('does not flag a scan 29 days old, nor a target with no schedule set yet as stale', () => {
    const kinds = buildTargetInsights({
      ...base,
      lastDiscoveredAt: new Date(NOW - 29 * DAY),
      scanSchedule: null,
    }).map((insight) => insight.kind);
    expect(kinds).toEqual([TargetInsightKind.NO_SCHEDULE]);
  });
});

describe('toSeverityCounts', () => {
  it('fills every severity and folds unknown ones into info', () => {
    expect(
      toSeverityCounts([
        { severity: 'critical', count: 2 },
        { severity: 'high', count: '3' },
        { severity: 'unknown', count: 1 },
        { severity: 'info', count: 1 },
      ]),
    ).toEqual({ critical: 2, high: 3, medium: 0, low: 0, info: 2 });
  });
});

describe('TargetOverviewService', () => {
  let repo: { findOneBy: jest.Mock };
  let query: jest.Mock;
  let queue: { getJobScheduler: jest.Mock };
  let service: TargetOverviewService;

  beforeEach(() => {
    repo = { findOneBy: jest.fn() };
    query = jest.fn().mockResolvedValue([]);
    queue = { getJobScheduler: jest.fn() };
    service = new TargetOverviewService(
      repo as unknown as Repository<Target>,
      { query } as unknown as DataSource,
      queue as unknown as Queue,
    );
  });

  it('rejects a target of another workspace', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.overview('t1', 'ws-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 't1', workspaceId: 'ws-2' });
    expect(query).not.toHaveBeenCalled();
  });

  describe('nextScanAt', () => {
    it('is null without a schedule, and never asks the queue', async () => {
      await expect(
        service.nextScanAt({ jobId: 'k', scanSchedule: CronSchedule.DISABLED }),
      ).resolves.toBeNull();
      expect(queue.getJobScheduler).not.toHaveBeenCalled();
    });

    it('reads the next fire time of the job scheduler', async () => {
      queue.getJobScheduler.mockResolvedValue({ next: NOW });
      await expect(
        service.nextScanAt({ jobId: 'k', scanSchedule: CronSchedule.DAILY }),
      ).resolves.toEqual(new Date(NOW));
      expect(queue.getJobScheduler).toHaveBeenCalledWith('k');
    });

    it('is null when the queue cannot be read', async () => {
      queue.getJobScheduler.mockRejectedValue(new Error('redis down'));
      await expect(
        service.nextScanAt({ jobId: 'k', scanSchedule: CronSchedule.DAILY }),
      ).resolves.toBeNull();
    });
  });

  it('builds the overview from its queries', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 't1',
      lastDiscoveredAt: new Date(),
      scanSchedule: CronSchedule.DISABLED,
      jobId: null,
    });
    query.mockImplementation((sql: string) => {
      if (sql.includes(`FILTER (WHERE "isEnabled")::int AS total`)) {
        return Promise.resolve([{ total: 12, recent: 3 }]);
      }
      if (sql.includes('GROUP BY v.severity')) {
        return Promise.resolve([{ severity: 'critical', count: 1 }]);
      }
      return Promise.resolve([]);
    });

    const overview = await service.overview('t1', 'ws-1');

    expect(overview).toEqual(
      expect.objectContaining({
        totalAssets: 12,
        newAssets: 3,
        openVulnerabilities: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        lastRun: null,
        activeRuns: [],
        nextScanAt: null,
      }),
    );
    expect(overview.insights.map((i) => i.kind)).toEqual([
      TargetInsightKind.CRITICAL_OPEN,
      TargetInsightKind.NEW_ASSETS,
      TargetInsightKind.NO_SCHEDULE,
    ]);
    // Every query is scoped to the target (and the workspace, for issues).
    for (const [, params] of query.mock.calls as Array<[string, unknown[]]>) {
      expect(params[0]).toBe('t1');
    }
  });

  it('pages changes of the requested kind, with their total', async () => {
    repo.findOneBy.mockResolvedValue({ id: 't1' });
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('AS total')
          ? [{ total: 45 }]
          : [{ kind: TargetChangeKind.FIXED, at: new Date(NOW), id: 'v1', label: 'XSS' }],
      ),
    );

    const page = await service.changes('t1', 'ws-1', {
      kind: TargetChangeKind.FIXED,
      page: 3,
      limit: 20,
    } as GetTargetChangesQueryDto);

    const [countSql, rowsSql] = (query.mock.calls as Array<[string]>).map(([sql]) => sql);
    expect(countSql).not.toContain("'asset'");
    expect(rowsSql).toContain("'fixed' AS kind");
    expect(rowsSql).not.toContain("'asset' AS kind");
    // Each kind reads up to the end of page 3; the union then skips two pages.
    expect(rowsSql).toContain('LIMIT 60');
    expect(rowsSql).toContain('ORDER BY at DESC, kind, id LIMIT 20 OFFSET 40');
    expect(page).toEqual(
      expect.objectContaining({ total: 45, page: 3, limit: 20, hasNextPage: false }),
    );
    expect(page.data).toEqual([
      expect.objectContaining({ id: 'v1', assetValue: null, severity: null }),
    ]);
  });

  it('adds vulnerabilities, progress, schedule and projects to list rows', async () => {
    queue.getJobScheduler.mockResolvedValue({ next: NOW });
    query.mockImplementation((sql: string) => {
      if (sql.includes('v.severity, COUNT')) {
        return Promise.resolve([
          { targetId: 'a', severity: 'high', count: 2 },
          { targetId: 'b', severity: 'low', count: 1 },
        ]);
      }
      if (sql.includes('WITH active')) {
        return Promise.resolve([{ targetId: 'a', done: 3, total: 10 }]);
      }
      if (sql.includes('FROM project_assets')) {
        return Promise.resolve([
          { targetId: 'b', id: 'p1', name: 'Web', hexColor: '#000', assets: 2 },
        ]);
      }
      return Promise.resolve([
        { id: 'a', jobId: 'k', scanSchedule: CronSchedule.WEEKLY },
        { id: 'b', jobId: null, scanSchedule: CronSchedule.DISABLED },
      ]);
    });

    const [a, b] = await service.withListDetails([{ id: 'a' }, { id: 'b' }]);

    expect(a).toEqual({
      id: 'a',
      openVulnerabilities: { critical: 0, high: 2, medium: 0, low: 0, info: 0 },
      scanProgress: { done: 3, total: 10 },
      nextScanAt: new Date(NOW),
      projects: [],
    });
    expect(b).toEqual(
      expect.objectContaining({
        scanProgress: null,
        nextScanAt: null,
        projects: [{ id: 'p1', name: 'Web', hexColor: '#000', assets: 2 }],
      }),
    );
  });

  it('skips the list queries for an empty page', async () => {
    await expect(service.withListDetails([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
