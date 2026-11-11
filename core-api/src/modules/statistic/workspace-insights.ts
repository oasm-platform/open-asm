import { InsightLevel } from '../targets/dto/target-overview.dto';

export enum WorkspaceInsightKind {
  CRITICAL_OPEN = 'critical_open',
  SLA_OVERDUE = 'sla_overdue',
  FAILED_RUNS = 'failed_runs',
  TLS_EXPIRING = 'tls_expiring',
  STALE_TARGETS = 'stale_targets',
  PENDING_REVIEW = 'pending_review',
  UNSCHEDULED_TARGETS = 'unscheduled_targets',
}

/** Window of the failed-runs count. */
export const FAILED_RUNS_DAYS = 7;
/** Certificates expired or expiring within this many days. */
export const TLS_EXPIRY_DAYS = 30;
/** Same threshold as the target list's `stale` count (`STALE_DAYS`). */
export const STALE_TARGET_DAYS = 30;

export interface WorkspaceInsightCounts {
  criticalOpen: number;
  slaOverdue: number;
  failedRuns: number;
  tlsExpiring: number;
  staleTargets: number;
  pendingReview: number;
  unscheduledTargets: number;
}

export interface WorkspaceInsight {
  kind: WorkspaceInsightKind;
  level: InsightLevel;
  count: number;
  days?: number;
}

/** Rules in display order: worst level first. */
const RULES: Array<{
  kind: WorkspaceInsightKind;
  level: InsightLevel;
  count: keyof WorkspaceInsightCounts;
  days?: number;
}> = [
  { kind: WorkspaceInsightKind.CRITICAL_OPEN, level: InsightLevel.CRITICAL, count: 'criticalOpen' },
  { kind: WorkspaceInsightKind.SLA_OVERDUE, level: InsightLevel.CRITICAL, count: 'slaOverdue' },
  {
    kind: WorkspaceInsightKind.FAILED_RUNS,
    level: InsightLevel.WARNING,
    count: 'failedRuns',
    days: FAILED_RUNS_DAYS,
  },
  {
    kind: WorkspaceInsightKind.TLS_EXPIRING,
    level: InsightLevel.WARNING,
    count: 'tlsExpiring',
    days: TLS_EXPIRY_DAYS,
  },
  {
    kind: WorkspaceInsightKind.STALE_TARGETS,
    level: InsightLevel.WARNING,
    count: 'staleTargets',
    days: STALE_TARGET_DAYS,
  },
  { kind: WorkspaceInsightKind.PENDING_REVIEW, level: InsightLevel.INFO, count: 'pendingReview' },
  {
    kind: WorkspaceInsightKind.UNSCHEDULED_TARGETS,
    level: InsightLevel.INFO,
    count: 'unscheduledTargets',
  },
];

/**
 * What the workspace needs attention for, worst first; kinds with nothing to
 * act on are left out. Pure, so the rules are tested without a database.
 */
export function buildWorkspaceInsights(counts: WorkspaceInsightCounts): WorkspaceInsight[] {
  return RULES.filter((rule) => counts[rule.count] > 0).map((rule) => ({
    kind: rule.kind,
    level: rule.level,
    count: counts[rule.count],
    ...(rule.days !== undefined ? { days: rule.days } : {}),
  }));
}
