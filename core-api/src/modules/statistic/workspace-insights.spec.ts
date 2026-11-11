import type { DataSource } from 'typeorm';
import type { GeoIpService } from '@/services/geo-ip/geo-ip.service';
import type { RedisService } from '@/services/redis/redis.service';
import { InsightLevel } from '../targets/dto/target-overview.dto';
import type { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import type { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import type { WorkspacesService } from '../workspaces/workspaces.service';
import { StatisticService } from './statistic.service';
import {
  buildWorkspaceInsights,
  WorkspaceInsightKind,
  type WorkspaceInsightCounts,
} from './workspace-insights';

const NONE: WorkspaceInsightCounts = {
  criticalOpen: 0,
  slaOverdue: 0,
  failedRuns: 0,
  tlsExpiring: 0,
  staleTargets: 0,
  pendingReview: 0,
  unscheduledTargets: 0,
};

describe('buildWorkspaceInsights', () => {
  it('returns nothing when every count is zero', () => {
    expect(buildWorkspaceInsights(NONE)).toEqual([]);
  });

  it('lists every non-zero count, worst level first, with its window', () => {
    const insights = buildWorkspaceInsights({
      criticalOpen: 7,
      slaOverdue: 5,
      failedRuns: 2,
      tlsExpiring: 3,
      staleTargets: 4,
      pendingReview: 1,
      unscheduledTargets: 6,
    });

    expect(insights).toEqual([
      { kind: WorkspaceInsightKind.CRITICAL_OPEN, level: InsightLevel.CRITICAL, count: 7 },
      { kind: WorkspaceInsightKind.SLA_OVERDUE, level: InsightLevel.CRITICAL, count: 5 },
      { kind: WorkspaceInsightKind.FAILED_RUNS, level: InsightLevel.WARNING, count: 2, days: 7 },
      { kind: WorkspaceInsightKind.TLS_EXPIRING, level: InsightLevel.WARNING, count: 3, days: 30 },
      { kind: WorkspaceInsightKind.STALE_TARGETS, level: InsightLevel.WARNING, count: 4, days: 30 },
      { kind: WorkspaceInsightKind.PENDING_REVIEW, level: InsightLevel.INFO, count: 1 },
      { kind: WorkspaceInsightKind.UNSCHEDULED_TARGETS, level: InsightLevel.INFO, count: 6 },
    ]);
  });

  it('skips the kinds with a zero count', () => {
    const kinds = buildWorkspaceInsights({ ...NONE, failedRuns: 1, pendingReview: 2 }).map(
      (insight) => insight.kind,
    );

    expect(kinds).toEqual([WorkspaceInsightKind.FAILED_RUNS, WorkspaceInsightKind.PENDING_REVIEW]);
  });
});

describe('StatisticService.getAttention', () => {
  const build = (query: jest.Mock) => {
    const service = new StatisticService(
      { query } as unknown as DataSource,
      {} as GeoIpService,
      {} as RedisService,
      {} as WorkspacesService,
      {} as EventBridgeService,
      {} as TechnologyForwarderService,
    );
    jest.spyOn(service, 'getTlsStatistics').mockResolvedValue({
      alreadyExpired: 1,
      expireInAMonth: 2,
      expireIn3Months: 9,
      wontExpireAnytimeSoon: 9,
      newCertificatesDiscovered: 9,
    });
    return service;
  };

  it('counts within the workspace and adds expired and soon expiring certificates', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        criticalOpen: '4',
        slaOverdue: '0',
        failedRuns: '2',
        staleTargets: '0',
        pendingReview: '0',
        unscheduledTargets: '1',
      },
    ]);
    const service = build(query);

    const { insights } = await service.getAttention('ws-1');

    expect(query).toHaveBeenCalledWith(expect.any(String), ['ws-1']);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('t."workspaceId" = $1');
    expect(insights).toEqual([
      { kind: WorkspaceInsightKind.CRITICAL_OPEN, level: InsightLevel.CRITICAL, count: 4 },
      { kind: WorkspaceInsightKind.FAILED_RUNS, level: InsightLevel.WARNING, count: 2, days: 7 },
      { kind: WorkspaceInsightKind.TLS_EXPIRING, level: InsightLevel.WARNING, count: 3, days: 30 },
      { kind: WorkspaceInsightKind.UNSCHEDULED_TARGETS, level: InsightLevel.INFO, count: 1 },
    ]);
  });

  it('treats a missing row as all zero', async () => {
    const service = build(jest.fn().mockResolvedValue([]));
    jest.spyOn(service, 'getTlsStatistics').mockResolvedValue({
      alreadyExpired: 0,
      expireInAMonth: 0,
      expireIn3Months: 0,
      wontExpireAnytimeSoon: 0,
      newCertificatesDiscovered: 0,
    });

    await expect(service.getAttention('ws-1')).resolves.toEqual({ insights: [] });
  });
});
