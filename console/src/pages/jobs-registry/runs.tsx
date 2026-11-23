import { Link, useParams } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';

import { CodeBlock } from '@/components/common/code-block';
import Page from '@/components/common/page';
import { WorkflowFileSheet } from '@/components/common/workflow-file-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import JobStatusBadge from '@/components/ui/job-status';
import { Progress } from '@/components/ui/progress';
import { OpenLink } from '@/components/ui/open-link';
import ToolLogo from '@/components/ui/tool-logo';
import RunWorkflowGraph from './components/run-workflow-graph';
import { useBugReportUrl } from '@/hooks/use-bug-report-url';
import { usePermission } from '@/hooks/usePermission';
import { useRunWorkflow } from '@/hooks/use-run-workflow';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { t, useT } from '@/lib/i18n-dictionary';
import type {
  JobListItemDto,
  WorkflowStepStatusDto,
} from '@/services/apis/gen/queries';
import {
  JobStatus,
  getJobsRegistryControllerGetJobHistoryDetailQueryKey,
  useJobsRegistryControllerCancelJob,
  useJobsRegistryControllerCancelJobHistory,
  useJobsRegistryControllerDeleteJob,
  useJobsRegistryControllerGetJobHistoryDetail,
  useJobsRegistryControllerGetManyJobs,
  useJobsRegistryControllerRetryJobHistory,
} from '@/services/apis/gen/queries';
import type { BugReport } from '@/utils/bug-report-url';
import { useQueryClient } from '@tanstack/react-query';
import { differenceInSeconds } from 'date-fns';
import { formatDate as formatLocalDate } from '@/lib/date-locale';
import { toast } from 'sonner';
import {
  ArrowRight,
  Ban,
  Bug,
  Calendar,
  ChevronRight,
  Clock,
  MoreHorizontal,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const NO_STEPS: WorkflowStepStatusDto[] = [];

/**
 * Refresh rate of an active run. Each refresh aggregates every job of the
 * run, so a 50,000-job run polled every second cost the API more than the
 * scan did.
 */
const ACTIVE_RUN_POLL_MS = 3_000;

const formatEta = (seconds?: number | null): string | null => {
  if (seconds == null) return null;
  if (seconds < 60) return t('jobsRegistry.run.etaLeft', { time: `${seconds}s` });
  const minutes = Math.round(seconds / 60);
  return t('jobsRegistry.run.etaLeft', {
    time:
      minutes < 60
        ? `${minutes}m`
        : `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
  });
};

const formatDate = (value?: string) =>
formatLocalDate(value, 'yyyy-MM-dd HH:mm:ss');

/** Elapsed time between pickup and completion; only meaningful once completed. */
const formatDuration = (job: JobListItemDto): string | null => {
  if (job.status !== JobStatus.completed) return null;

  // NaN when either date is missing or invalid
  const totalSeconds = differenceInSeconds(new Date(job.completedAt ?? NaN), new Date(job.pickJobAt ?? NaN));
  if (!(totalSeconds >= 0)) return null;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
};

const getTitle = (row: JobListItemDto) =>
  row.assetService?.value || row.asset?.value || row.id;

const stripTrailingNewline = (value: unknown) =>
  String(value ?? '').replace(/\n$/, '');

/** Bug report prefill for a job's error logs. Leaves out the asset, command
 * and config: they name the user's targets and may carry secrets. */
const buildJobBugReport = (job: JobListItemDto): BugReport => {
  const toolName = job.tool?.name || 'Unknown tool';
  return {
    title: `Bug: ${toolName} job failed`,
    whatHappened: [
      `The ${toolName} job reported errors.`,
      '',
      `Job ID: ${job.id}`,
      `Category: ${job.category}`,
      `Status: ${job.status}`,
      `Retries: ${job.retryCount ?? 0}`,
    ].join('\n'),
    component: 'Job Management',
    logs: job.errorLogs
      .map((errorLog) => stripTrailingNewline(errorLog.logMessage))
      .join('\n\n'),
  };
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-sm">{children}</span>
    </div>
  );
}

/** Inline detail panel revealed by expanding a job row. Memoized because the
 * page re-renders on every one-second poll and the rows keep their identity. */
const JobDetailPanel = memo(function JobDetailPanel({
  job,
}: {
  job: JobListItemDto;
}) {
  const t = useT();
  const duration = formatDuration(job);
  const hasConfig = !!job.config && Object.keys(job.config).length > 0;
  const bugReportUrl = useBugReportUrl(
    job.errorLogs?.length ? buildJobBugReport(job) : undefined,
  );

  return (
    <div className="space-y-5 border-l-2 border-primary/40 bg-muted/30 px-4 py-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Field label={t('jobsRegistry.run.jobId')}>
          <span className="font-mono text-xs">{job.id}</span>
        </Field>
        <Field label={t('common.status')}>
          <JobStatusBadge status={job.status as JobStatus} />
        </Field>
        <Field label={t('jobsRegistry.run.category')}>
          <span className="capitalize">{job.category.replace(/_/g, ' ')}</span>
        </Field>
        <Field label={t('jobsRegistry.run.priority')}>{job.priority ?? '—'}</Field>
        <Field label={t('jobsRegistry.run.worker')}>
          <span className="font-mono text-xs">{job.workerId || '—'}</span>
        </Field>
        <Field label={t('jobsRegistry.run.retries')}>{job.retryCount ?? 0}</Field>
        <Field label={t('jobsRegistry.run.created')}>{formatDate(job.createdAt)}</Field>
        <Field label={t('jobsRegistry.run.pickedUp')}>{formatDate(job.pickJobAt)}</Field>
        <Field label={t('jobsRegistry.run.completed')}>{formatDate(job.completedAt)}</Field>
        <Field label={t('jobsRegistry.run.duration')}>{duration ?? '—'}</Field>
        <Field label={t('jobsRegistry.run.asset')}>
          {job.asset?.id ? (
            <Link
              to="/assets/services/$id"
              params={{ id: job.asset.id }}
              className="hover:underline"
            >
              {job.asset.value}
            </Link>
          ) : (
            (job.asset?.value ?? '—')
          )}
        </Field>
        <Field label={t('jobsRegistry.run.assetService')}>
          {job.assetServiceId ? (
            <Link
              to="/assets/services/$id"
              params={{ id: job.assetServiceId }}
              className="hover:underline"
            >
              {job.assetService?.value ?? job.assetServiceId}
            </Link>
          ) : (
            '—'
          )}
        </Field>
      </div>

      {job.command && <CodeBlock language={t('jobsRegistry.run.command')} value={job.command} />}

      {hasConfig && (
        <CodeBlock
          language={t('jobsRegistry.run.configMasked')}
          value={JSON.stringify(job.config, null, 2)}
        />
      )}

      {!!job.errorLogs?.length && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-destructive">
              <TriangleAlert className="h-3.5 w-3.5" />
              {t('jobsRegistry.run.errorLogs', { n: job.errorLogs.length })}
            </span>
            {bugReportUrl && (
              <Button asChild size="sm" variant="outline">
                <OpenLink
                  href={bugReportUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Bug />
                  {t('jobsRegistry.run.reportBug')}
                </OpenLink>
              </Button>
            )}
          </div>
          {job.errorLogs.map((errorLog, index) => (
            <div
              key={errorLog.id ?? index}
              className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
            >
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-background/60 p-2 font-mono text-sm text-destructive">
                {stripTrailingNewline(errorLog.logMessage)}
              </pre>
              {!!errorLog.payload && (
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-background/60 p-2 font-mono text-xs text-muted-foreground">
                  {stripTrailingNewline(errorLog.payload)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default function Runs() {
  const t = useT();
  const { id: jobHistoryId } = useParams({ strict: false });
  const queryClient = useQueryClient();

  const { hasPermission } = usePermission();
  const { mutate: deleteJobMutate } = useJobsRegistryControllerDeleteJob();
  const { mutate: cancelJobMutate } = useJobsRegistryControllerCancelJob();
  const {
    mutate: cancelRunMutate,
    isPending: isCancellingRun,
  } = useJobsRegistryControllerCancelJobHistory();
  const { mutate: retryRunMutate, isPending: isRetryingRun } =
    useJobsRegistryControllerRetryJobHistory({
      mutation: {
        onSuccess: (result) => {
          toast.success(t('jobsRegistry.run.retryStarted'), {
            description: t('jobsRegistry.run.newRun', { id: result.jobHistoryId.slice(0, 8) }),
          });
          queryClient.invalidateQueries({
            queryKey: getJobsRegistryControllerGetJobHistoryDetailQueryKey(
              result.jobHistoryId,
            ),
          });
        },
      },
    });

  const { tableParams, tableHandlers } = useServerDataTable({
    defaultPage: 1,
    defaultPageSize: 10,
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'DESC',
    isUpdateSearchQueryParam: false,
  });

  const hasActiveJobsRef = useRef(false);
  const [isCodeOpen, setCodeOpen] = useState(false);
  // Fetched only while the sheet is open: the YAML view is a one-off peek at
  // the definition, not something the run page needs while it is closed.
  const { data: runWorkflow, isLoading: isLoadingWorkflow } = useRunWorkflow(
    jobHistoryId || '',
    { enabled: isCodeOpen },
  );

  const { data: jobHistoryDetail } =
    useJobsRegistryControllerGetJobHistoryDetail(jobHistoryId || '', {
      query: {
        // Poll only while any tool in this run is still active.
        // The function form is evaluated lazily by React Query, so it always
        // reads the latest value without re-creating the query config.
        refetchInterval: () =>
          hasActiveJobsRef.current ? ACTIVE_RUN_POLL_MS : false,
      },
    });

  // Check if any tools are still active via API status. Workflow runs carry
  // their own per-step state; runs created before the engine only have tools.
  // Runs without a workflow (custom-template runs) have neither, so the job
  // count is what keeps them polling.
  const hasActiveJobs = useMemo(() => {
    if ((jobHistoryDetail?.activeJobsCount ?? 0) > 0) return true;
    const steps = jobHistoryDetail?.steps ?? [];
    if (steps.length > 0) {
      return steps.some(
        (step) => step.status === 'pending' || step.status === 'dispatched',
      );
    }
    const tools = jobHistoryDetail?.tools || [];
    return tools.some(
      (tool) =>
        tool.status === JobStatus.pending ||
        tool.status === JobStatus.in_progress,
    );
  }, [
    jobHistoryDetail?.activeJobsCount,
    jobHistoryDetail?.steps,
    jobHistoryDetail?.tools,
  ]);

  useEffect(() => {
    hasActiveJobsRef.current = hasActiveJobs;
  }, [hasActiveJobs]);

  const {
    data: paginatedJobsData,
    isLoading: isLoadingJobs,
    error: jobsError,
    queryKey: paginatedJobsQueryKey,
  } = useJobsRegistryControllerGetManyJobs(
    {
      page: tableParams.page,
      limit: tableParams.pageSize,
      sortBy: tableParams.sortBy,
      sortOrder: tableParams.sortOrder,
      jobHistoryId: jobHistoryId || '',
    },
    {
      query: {
        refetchInterval: hasActiveJobs ? ACTIVE_RUN_POLL_MS : false,
      },
    },
  );

  /** Re-reads both the run summary (active job count) and the job table. */
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getJobsRegistryControllerGetJobHistoryDetailQueryKey(
        jobHistoryId || '',
      ),
    });
    queryClient.invalidateQueries({ queryKey: paginatedJobsQueryKey });
  }, [jobHistoryId, paginatedJobsQueryKey, queryClient]);

  const activeJobsCount = jobHistoryDetail?.activeJobsCount ?? 0;
  // Stable identity: a fresh `[]` on every render would re-render the graph and
  // the table once per poll tick for no reason.
  const steps = useMemo(
    () => jobHistoryDetail?.steps ?? NO_STEPS,
    [jobHistoryDetail?.steps],
  );

  const columns: ColumnDef<JobListItemDto>[] = useMemo(
    () => [
    {
      accessorKey: 'status',
      cell: ({ row }) => {
        const errorCount = row.original.errorLogs?.length ?? 0;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <JobStatusBadge
              onlyIcon
              status={row.original.status as JobStatus}
            />
            <span className="truncate font-medium">
              {getTitle(row.original)}
            </span>
            <Badge
              variant="outline"
              className="shrink-0 font-normal capitalize text-muted-foreground"
            >
              {row.original.category.replace(/_/g, ' ')}
            </Badge>
            {errorCount > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
                <TriangleAlert className="h-3.5 w-3.5" />
                {errorCount}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'tool',
      cell: ({ row }) => (
        <div className="flex items-center">
          {row.original.tool ? (
            <Link
              to="/tools/$id"
              params={{ id: row.original.tool.id ?? '' }}
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <ToolLogo
                name={row.original.tool.name ?? ''}
                logoUrl={row.original.tool?.logoUrl}
                size={30}
                className="rounded-full"
              />
              <span className="font-bold capitalize">
                {row.original.tool.name}
              </span>
            </Link>
          ) : (
            <span className="text-muted-foreground">{t('jobsRegistry.run.noTool')}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'updatedAt',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <Calendar className="h-4 w-4 shrink-0" />
          {formatDate(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: 'duration',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <Clock className="h-4 w-4 shrink-0" />
          {formatDuration(row.original) ?? '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const canCancel =
          row.original.status === JobStatus.pending ||
          row.original.status === JobStatus.in_progress;

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-8 w-8 items-center justify-center p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="sr-only">{t('jobsRegistry.run.openMenu')}</span>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                {canCancel && (
                  <ConfirmDialog
                    title={t('jobsRegistry.run.cancelJobTitle')}
                    description={t('jobsRegistry.run.cancelJobDescription')}
                    onConfirm={() =>
                      cancelJobMutate({ id: row.original.id }, { onSuccess: refresh })
                    }
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        {t('common.cancel')}
                      </DropdownMenuItem>
                    }
                  />
                )}
                <ConfirmDialog
                  title={t('jobsRegistry.run.deleteJobTitle')}
                  description={t('jobsRegistry.run.deleteJobDescription')}
                  onConfirm={() =>
                    deleteJobMutate({ id: row.original.id }, { onSuccess: refresh })
                  }
                  trigger={
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(e) => e.preventDefault()}
                    >
                      {t('common.delete')}
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
    ],
    [cancelJobMutate, deleteJobMutate, refresh, t],
  );

  return (
    <Page
      permission="job.read"
     
      title={
        jobHistoryDetail?.jobHistoryName ||
        jobHistoryDetail?.workflowName ||
        t('jobsRegistry.run.title')
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          {activeJobsCount > 0 && hasPermission('job.write') && (
            <ConfirmDialog
              title={t('jobsRegistry.run.cancelRunTitle')}
              description={t('jobsRegistry.run.cancelRunDescription', { count: activeJobsCount })}
              confirmText={t('jobsRegistry.run.cancelRun')}
              disabled={isCancellingRun}
              onConfirm={() =>
                cancelRunMutate(
                  { id: jobHistoryId || '' },
                  { onSuccess: refresh },
                )
              }
              trigger={
                <Button variant="outline" disabled={isCancellingRun}>
                  <Ban className="h-4 w-4" />
                  {t('jobsRegistry.run.cancelRun')}
                </Button>
              }
            />
          )}
          {activeJobsCount === 0 && hasPermission('job.write') && steps.length > 0 && (
            <Button
              variant="outline"
              disabled={isRetryingRun}
              onClick={() => retryRunMutate({ id: jobHistoryId || '' })}
            >
              <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
              {t('jobsRegistry.run.retryRun')}
            </Button>
          )}
        </div>
      }
    >
      {jobHistoryDetail && (
        <Card className="mb-4 py-2">
          <CardContent className="flex flex-col gap-2 px-2 py-2 md:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">
                  {t('jobsRegistry.run.steps', {
                    done: jobHistoryDetail.stepsDone,
                    total: jobHistoryDetail.stepsTotal,
                  })}
                </span>
                <span className="text-muted-foreground">
                  {jobHistoryDetail.progress}%
                </span>
                {formatEta(jobHistoryDetail.etaSeconds) && (
                  <span className="text-muted-foreground">
                    · {formatEta(jobHistoryDetail.etaSeconds)}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {activeJobsCount > 0
                  ? t('jobsRegistry.run.activeJobs', { count: activeJobsCount })
                  : t('jobsRegistry.run.finished')}
              </span>
            </div>
            <Progress
              value={jobHistoryDetail.progress}
              aria-label={t('jobsRegistry.list.runProgress')}
            />
            {jobHistoryDetail.failureReason && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                {jobHistoryDetail.failureReason}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {/* Workflow steps (DAG) — falls back to the tool list for runs created
          before the workflow engine existed. */}
      {steps.length ? (
        <Card className="mb-6 py-2">
          <CardContent className="px-2 py-2 md:px-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <CardTitle>{t('jobsRegistry.run.workflow')}</CardTitle>
              <WorkflowFileSheet
                open={isCodeOpen}
                onOpenChange={setCodeOpen}
                yaml={runWorkflow?.yaml ?? ''}
                isLoading={isLoadingWorkflow}
                description={t('jobsRegistry.run.workflowFileDescription')}
                emptyMessage={t('jobsRegistry.run.noWorkflow')}
              />
            </div>
            <RunWorkflowGraph
              steps={steps}
              trigger={jobHistoryDetail?.jobRunType}
              startedAt={jobHistoryDetail?.createdAt}
            />
          </CardContent>
        </Card>
      ) : (
        !!jobHistoryDetail?.tools?.length && (
          <Card className="mb-6 py-2">
            <CardContent className="px-2 py-2 md:px-4">
              <CardTitle className="mb-3">{t('jobsRegistry.run.tools')}</CardTitle>
              <div className="flex flex-wrap items-center gap-4">
                {jobHistoryDetail.tools.map((tool, index) => (
                  <div key={tool.id} className="flex items-center gap-2">
                    <Link
                      to="/tools/$id"
                      params={{ id: tool.id }}
                      className="flex items-center gap-2 hover:opacity-80"
                    >
                      <ToolLogo
                        name={tool.name}
                        logoUrl={tool.logoUrl}
                        size={40}
                        className="rounded-full border"
                      />
                      <span className="text-sm font-medium">{tool.name}</span>
                      {tool.status && (
                        <JobStatusBadge status={tool.status} onlyIcon />
                      )}
                    </Link>
                    {index < jobHistoryDetail.tools.length - 1 && (
                      <ArrowRight className="text-muted-foreground" size={16} />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      )}

      <CollapsibleDataTable
        isShowHeader={false}
        rowClassName="group"
        columns={columns}
        data={paginatedJobsData?.data || []}
        isLoading={isLoadingJobs}
        page={paginatedJobsData?.page ?? tableParams.page}
        pageSize={paginatedJobsData?.limit ?? tableParams.pageSize}
        totalItems={paginatedJobsData?.total ?? 0}
        emptyMessage={
          jobsError ? t('jobsRegistry.run.loadJobsFailed') : t('jobsRegistry.list.empty')
        }
        onPageChange={tableHandlers.setPage}
        onPageSizeChange={tableHandlers.setPageSize}
        collapsibleElement={(job) => <JobDetailPanel job={job} />}
      />
    </Page>
  );
}
