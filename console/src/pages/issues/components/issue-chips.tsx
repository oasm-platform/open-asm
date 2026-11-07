import { UserAvatar } from '@/components/comments/comment-thread';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { IssueProgressDto, IssueUserDto } from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import {
  daysOverdue,
  dueState,
  ISSUE_PRIORITY_HINT,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_TYPE_LABELS,
  type IssuePriority,
  type IssueStatus,
  type IssueType,
} from '../issue-utils';

const TYPE_CLASSES: Record<IssueType, string> = {
  vulnerability_remediation:
    'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  task: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  asset_review:
    'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  scan_failure:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

export function IssueTypeChip({ type }: { type: IssueType }) {
  return (
    <Badge variant="outline" className={cn('font-medium', TYPE_CLASSES[type])}>
      {ISSUE_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

const STATUS_CLASSES: Record<IssueStatus, string> = {
  open: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  in_progress:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  resolved:
    'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
  closed: 'border-border bg-muted text-muted-foreground',
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status]}>
      {ISSUE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const PRIORITY_CLASSES: Record<IssuePriority, string> = {
  p1: 'bg-red-600 text-white border-transparent',
  p2: 'bg-orange-500 text-white border-transparent',
  p3: 'bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 border-yellow-500/40',
  p4: 'bg-muted text-muted-foreground border-border',
};

export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  return (
    <Badge
      variant="outline"
      title={ISSUE_PRIORITY_HINT[priority]}
      data-priority={priority}
      className={cn('font-semibold tabular-nums', PRIORITY_CLASSES[priority])}
    >
      {ISSUE_PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}

export function AssigneeCell({ user }: { user: IssueUserDto | null }) {
  if (!user) {
    return <span className="text-xs text-muted-foreground">Unassigned</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <UserAvatar user={user} className="size-6" />
      <span className="truncate text-sm">{user.name}</span>
    </span>
  );
}

export function DueLabel({
  dueAt,
  status,
  className,
}: {
  dueAt: string | null;
  status: IssueStatus;
  className?: string;
}) {
  const state = dueState(dueAt, status);
  if (!dueAt || state === 'none') {
    return <span className="text-muted-foreground">—</span>;
  }
  const label = format(new Date(dueAt), 'dd MMM yyyy');
  return (
    <span
      data-due={state}
      className={cn(
        'whitespace-nowrap text-sm',
        state === 'overdue' && 'font-medium text-red-600 dark:text-red-400',
        state === 'soon' && 'font-medium text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      {state === 'overdue'
        ? `${label} · ${daysOverdue(dueAt)}d overdue`
        : label}
    </span>
  );
}

export function ProgressCell({
  progress,
}: {
  progress: IssueProgressDto | null;
}) {
  if (!progress) return <span className="text-muted-foreground">—</span>;
  const percent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <span className="flex min-w-24 items-center gap-2">
      <Progress value={percent} className="h-1.5 w-14" />
      <span className="text-xs tabular-nums text-muted-foreground">
        {progress.done}/{progress.total}
      </span>
    </span>
  );
}
