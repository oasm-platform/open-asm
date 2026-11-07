import type {
  IssueDetailDtoPriority,
  IssueDetailDtoResolution,
  IssueDetailDtoStatus,
  IssueDetailDtoType,
  IssueLinkDtoResourceType,
} from '@/services/apis/gen/queries';

export type IssueType = IssueDetailDtoType;
export type IssueStatus = IssueDetailDtoStatus;
export type IssuePriority = IssueDetailDtoPriority;
export type IssueResolution = NonNullable<IssueDetailDtoResolution>;
export type LinkResourceType = IssueLinkDtoResourceType;

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  vulnerability_remediation: 'Vulnerability remediation',
  task: 'Task',
  asset_review: 'Asset review',
  scan_failure: 'Scan failure',
};

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  p1: 'P1',
  p2: 'P2',
  p3: 'P3',
  p4: 'P4',
};

export const ISSUE_PRIORITY_HINT: Record<IssuePriority, string> = {
  p1: 'P1 · Urgent',
  p2: 'P2 · High',
  p3: 'P3 · Medium',
  p4: 'P4 · Low',
};

export const ISSUE_RESOLUTION_LABELS: Record<IssueResolution, string> = {
  fixed: 'Fixed',
  accepted: 'Risk accepted',
  duplicate: 'Duplicate',
  wont_fix: "Won't fix",
  other: 'Other',
};

export const LINK_RESOURCE_LABELS: Record<LinkResourceType, string> = {
  vulnerability: 'Vulnerabilities',
  asset: 'Assets',
  target: 'Targets',
  project: 'Projects',
  job_history: 'Runs',
};

export const LINK_RESOURCE_SINGULAR: Record<LinkResourceType, string> = {
  vulnerability: 'vulnerability',
  asset: 'asset',
  target: 'target',
  project: 'project',
  job_history: 'run',
};

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
