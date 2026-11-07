import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Clock, PauseCircle } from 'lucide-react';
import {
  DETECTION_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  daysUntil,
} from './lifecycle';

export { SeverityBadge } from '@/components/ui/severity-badge';

const chip = 'h-6 rounded-full border px-2 text-xs font-medium';

const DETECTION_STYLES: Record<string, string> = {
  new: 'border-primary/30 bg-primary/10 text-primary',
  active: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  fixed: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
  resurfaced:
    'border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300',
};

const REVIEW_STYLES: Record<string, string> = {
  pending_review:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  approved: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
  rejected: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

/** Detection lifecycle chip: new, active, fixed, resurfaced. */
export function DetectionStatusBadge({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  if (!status) return null;
  return (
    <Badge
      variant="outline"
      className={cn(chip, DETECTION_STYLES[status], className)}
      data-status={status}
    >
      {DETECTION_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/** Review chip of an AI proposal: pending review, approved, rejected. */
export function ReviewStatusBadge({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  if (!status) return null;
  return (
    <Badge
      variant="outline"
      className={cn(chip, REVIEW_STYLES[status], className)}
      data-status={status}
    >
      {REVIEW_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/** States in which an SLA no longer runs. */
const CLOSED_STATUSES = new Set(['fixed', 'resolved', 'closed', 'rejected']);
/** States in which an SLA is on hold. */
const PAUSED_STATUSES = new Set(['paused', 'risk_accepted']);

/**
 * SLA deadline as text: "due in 5 days", "due today", "3 days overdue",
 * "paused" (risk accepted), or a dash when there is none or it is closed.
 */
export function SlaDue({
  dueAt,
  status,
  paused,
  className,
}: {
  dueAt?: string | null;
  /** Detection or issue status; 'paused' / 'risk_accepted' pause it, fixed/resolved/closed end it. */
  status?: string | null;
  paused?: boolean;
  className?: string;
}) {
  if (paused || (status && PAUSED_STATUSES.has(status))) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs text-muted-foreground',
          className,
        )}
      >
        <PauseCircle className="size-3" />
        paused
      </span>
    );
  }
  if (!dueAt || (status && CLOSED_STATUSES.has(status))) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }
  const days = daysUntil(dueAt);
  const label =
    days < 0
      ? `${-days} day${days === -1 ? '' : 's'} overdue`
      : days === 0
        ? 'due today'
        : `due in ${days} day${days === 1 ? '' : 's'}`;
  const tone =
    days < 0
      ? 'text-red-600 dark:text-red-400 font-medium'
      : days <= 3
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs', tone, className)}
      title={new Date(dueAt).toLocaleDateString()}
    >
      <Clock className="size-3" />
      {label}
    </span>
  );
}

/** `#12`, linking to the issue. */
export function IssueRefLink({
  issue,
  className,
}: {
  issue: { id: string; no: number };
  className?: string;
}) {
  return (
    <Link
      to="/issues/$id"
      params={{ id: issue.id }}
      className={cn('text-sm font-medium text-primary hover:underline', className)}
      onClick={(e) => e.stopPropagation()}
    >
      #{issue.no}
    </Link>
  );
}
