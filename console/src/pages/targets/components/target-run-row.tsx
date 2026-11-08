import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import JobStatusBadge from '@/components/ui/job-status';
import {
  JobStatus,
  useJobsRegistryControllerCancelJobHistory,
  type TargetRunDto,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Square } from 'lucide-react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  runTriggerLabel,
  workflowLabel,
} from '../../projects/project-utils';
import { progressPercent } from '../target-utils';

dayjs.extend(relativeTime);

const isActive = (run: TargetRunDto) =>
  run.status === JobStatus.pending || run.status === JobStatus.in_progress;

/** One run on the target: what ran, its progress there, and a stop button while it runs. */
export function TargetRunRow({ run }: { run: TargetRunDto }) {
  const queryClient = useQueryClient();
  const active = isActive(run);
  const { mutate: cancel, isPending } =
    useJobsRegistryControllerCancelJobHistory({
      mutation: {
        onSuccess: () => {
          toast.success('Run cancelled');
          void queryClient.invalidateQueries({
            predicate: (query) =>
              String(query.queryKey[0]).startsWith('/api/targets'),
          });
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, 'Failed to cancel the run')),
      },
    });
  const percent = progressPercent(
    run.jobsDone + run.jobsFailed,
    run.jobsTotal,
  );

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link
          to="/jobs/runs/$id"
          params={{ id: run.id }}
          className="font-medium hover:underline"
        >
          {workflowLabel({ name: run.workflowName })}
        </Link>
        <JobStatusBadge status={run.status} />
        <span className="text-muted-foreground">
          {runTriggerLabel(run.jobRunType)}
          {run.projectId && run.projectName ? (
            <>
              {' · '}
              <Link
                to="/projects/$id/$tab"
                params={{ id: run.projectId, tab: 'overview' }}
                className="hover:underline"
              >
                {run.projectName}
              </Link>
            </>
          ) : null}
          {' · '}
          <span title={dayjs(run.createdAt).format('YYYY-MM-DD HH:mm')}>
            {dayjs(run.createdAt).fromNow()}
          </span>
        </span>
        {run.newVulnerabilities > 0 && (
          <span className="text-primary">+{run.newVulnerabilities} new</span>
        )}
        {active && (
          <ConfirmDialog
            title="Cancel run"
            description="Jobs that have not finished are cancelled and the workflow starts no further steps."
            onConfirm={() => cancel({ id: run.id })}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-muted-foreground"
                disabled={isPending}
              >
                <Square className="size-3.5" />
                Cancel
              </Button>
            }
          />
        )}
      </div>
      {run.jobsTotal > 0 && (
        <div className="flex items-center gap-3">
          <div
            className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-primary/20"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${percent}% of jobs finished`}
          >
            <span
              className="bg-primary transition-all"
              style={{ width: `${(run.jobsDone / run.jobsTotal) * 100}%` }}
            />
            <span
              className="bg-destructive transition-all"
              style={{ width: `${(run.jobsFailed / run.jobsTotal) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {run.jobsDone + run.jobsFailed}/{run.jobsTotal} jobs
            {run.jobsFailed > 0 && (
              <span className="text-destructive">
                {' '}
                · {run.jobsFailed} failed
              </span>
            )}
            {active && run.currentTool && <> · {run.currentTool}</>}
          </span>
        </div>
      )}
    </div>
  );
}
