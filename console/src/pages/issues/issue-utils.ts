import type {
  IssueDetailDtoPriority,
  IssueDetailDtoResolution,
  IssueDetailDtoStatus,
  IssueDetailDtoType,
  IssueLinkDtoResourceType,
} from '@/services/apis/gen/queries';
import { t } from '@/lib/i18n-dictionary';

export type IssueType = IssueDetailDtoType;
export type IssueStatus = IssueDetailDtoStatus;
export type IssuePriority = IssueDetailDtoPriority;
export type IssueResolution = NonNullable<IssueDetailDtoResolution>;
export type LinkResourceType = IssueLinkDtoResourceType;

/**
 * A label map whose values are translated on every read, so existing
 * `MAP[value]` / `Object.entries(MAP)` call sites follow the active language.
 */
export function translated<K extends string>(keys: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const [k, key] of Object.entries(keys) as [K, string][]) {
    Object.defineProperty(out, k, { get: () => t(key), enumerable: true });
  }
  return out;
}

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = translated({
  vulnerability_remediation: 'issues.type.vulnerabilityRemediation',
  task: 'issues.type.task',
  asset_review: 'issues.type.assetReview',
  scan_failure: 'issues.type.scanFailure',
});

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = translated({
  open: 'issues.status.open',
  in_progress: 'issues.status.inProgress',
  resolved: 'issues.status.resolved',
  closed: 'issues.status.closed',
});

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  p1: 'P1',
  p2: 'P2',
  p3: 'P3',
  p4: 'P4',
};

export const ISSUE_PRIORITY_HINT: Record<IssuePriority, string> = translated({
  p1: 'issues.priority.p1',
  p2: 'issues.priority.p2',
  p3: 'issues.priority.p3',
  p4: 'issues.priority.p4',
});

export const ISSUE_RESOLUTION_LABELS: Record<IssueResolution, string> = translated({
  fixed: 'issues.resolution.fixed',
  accepted: 'issues.resolution.accepted',
  duplicate: 'issues.resolution.duplicate',
  wont_fix: 'issues.resolution.wontFix',
  other: 'issues.resolution.other',
});

export const LINK_RESOURCE_LABELS: Record<LinkResourceType, string> = translated({
  vulnerability: 'issues.resource.vulnerability',
  asset: 'issues.resource.asset',
  target: 'issues.resource.target',
  project: 'issues.resource.project',
  job_history: 'issues.resource.jobHistory',
});

export const LINK_RESOURCE_SINGULAR: Record<LinkResourceType, string> = translated({
  vulnerability: 'issues.resourceOne.vulnerability',
  asset: 'issues.resourceOne.asset',
  target: 'issues.resourceOne.target',
  project: 'issues.resourceOne.project',
  job_history: 'issues.resourceOne.jobHistory',
});

export const isFinalStatus = (status: IssueStatus) =>
  status === 'resolved' || status === 'closed';

export const formatIssueNo = (no: number) => `#${no}`;

const DAY = 24 * 60 * 60 * 1000;

export type DueState = 'overdue' | 'soon' | 'normal' | 'none';

/** Overdue (red) / due within 3 days (amber) apply only while the issue is still being worked on. */
export function dueState(
  dueAt: string | null | undefined,
  status: IssueStatus,
  now: Date = new Date(),
): DueState {
  if (!dueAt) return 'none';
  if (isFinalStatus(status)) return 'normal';
  const diff = new Date(dueAt).getTime() - now.getTime();
  if (diff < 0) return 'overdue';
  if (diff < 3 * DAY) return 'soon';
  return 'normal';
}

export function daysOverdue(dueAt: string, now: Date = new Date()) {
  return Math.max(
    1,
    Math.floor((now.getTime() - new Date(dueAt).getTime()) / DAY),
  );
}

/** Message of an API error (Nest `{ message }`), falling back to `fallback`. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (
    error as { response?: { data?: { message?: unknown } } } | undefined
  )?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' && message ? message : fallback;
}

export function apiErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | undefined)?.response
    ?.status;
}

/** Turns a date input value (yyyy-MM-dd) into the end of that local day, as ISO. */
export function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
