import { UserAvatar } from '@/components/comments/comment-thread';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { IssueDetailDto } from '@/services/apis/gen/queries';
import { formatDistanceToNowStrict } from 'date-fns';
import { CalendarClock, UserRound, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatIssueNo, type IssuePriority } from '../issue-utils';
import {
  DueLabel,
  IssueStatusBadge,
  IssueTypeChip,
  PriorityBadge,
} from './issue-chips';

/** Accent on the panel's edge, by priority. */
const PRIORITY_BAR: Record<IssuePriority, string> = {
  p1: 'bg-red-600',
  p2: 'bg-orange-500',
  p3: 'bg-yellow-500',
  p4: 'bg-slate-400',
};

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      {children}
    </span>
  );
}

/**
 * Top of the issue page: number, state, priority and type, who owns it and
 * when it is due, plus the fix progress of a remediation issue.
 */
export function IssueHero({
  issue,
  sourceLabel,
}: {
  issue: IssueDetailDto;
  sourceLabel: string;
}) {
  const progress = issue.progress;
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      data-testid="issue-hero"
    >
      <div className="flex">
        <div
          className={cn('w-1 shrink-0', PRIORITY_BAR[issue.priority])}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-1.5 [&>*]:h-6 [&>*]:rounded-md">
            <Badge variant="outline" className="font-mono">
              {formatIssueNo(issue.no)}
            </Badge>
            <IssueStatusBadge status={issue.status} />
            <PriorityBadge priority={issue.priority} />
            <IssueTypeChip type={issue.type} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <Meta icon={<UserRound />}>
              {issue.assignee ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <UserAvatar user={issue.assignee} className="size-5" />
                  {issue.assignee.name}
                </span>
              ) : (
                'Unassigned'
              )}
            </Meta>
            <Meta icon={<CalendarClock />}>
              Opened{' '}
              {formatDistanceToNowStrict(new Date(issue.createdAt), {
                addSuffix: true,
              })}
              {issue.createdBy ? ` by ${issue.createdBy.name}` : ''}
            </Meta>
            {issue.dueAt && (
              <Meta icon={<CalendarClock />}>
                Due <DueLabel dueAt={issue.dueAt} status={issue.status} />
              </Meta>
            )}
            <Meta icon={<Workflow />}>{sourceLabel}</Meta>
          </div>
        </div>
      </div>
      {progress && progress.total > 0 && (
        <div className="flex items-center gap-4 border-t px-5 py-3 text-sm">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Fix progress
          </span>
          <Progress
            value={percent}
            aria-label="Fix progress"
            className="h-1.5 flex-1"
          />
          <span className="shrink-0 tabular-nums">
            <span className="font-semibold">{progress.done}</span>
            <span className="text-muted-foreground">
              {' '}
              / {progress.total} fixed
            </span>
          </span>
        </div>
      )}
    </section>
  );
}
