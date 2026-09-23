import { Link, useParams } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';

import { CodeBlock } from '@/components/common/code-block';
import Page from '@/components/common/page';
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
import ToolLogo from '@/components/ui/tool-logo';
import { usePermission } from '@/hooks/usePermission';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import type { JobListItemDto } from '@/services/apis/gen/queries';
import {
  JobStatus,
  getJobsRegistryControllerGetJobHistoryDetailQueryKey,
  useJobsRegistryControllerCancelJob,
  useJobsRegistryControllerCancelJobHistory,
  useJobsRegistryControllerDeleteJob,
  useJobsRegistryControllerGetJobHistoryDetail,
  useJobsRegistryControllerGetManyJobs,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  ArrowRight,
  Ban,
  Calendar,
  ChevronRight,
  Clock,
  MoreHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

const formatDate = (value?: string) =>
  value && dayjs(value).isValid()
    ? dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    : '—';

/** Elapsed time between pickup and completion; only meaningful once completed. */
const formatDuration = (job: JobListItemDto): string | null => {
  const pickJobAt = dayjs(job.pickJobAt);
  const completedAt = dayjs(job.completedAt);

  if (
    job.status !== JobStatus.completed ||
    !pickJobAt.isValid() ||
    !completedAt.isValid()
  ) {
    return null;
  }

  const totalSeconds = completedAt.diff(pickJobAt, 'second');
  if (totalSeconds < 0) return null;

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

/** Inline detail panel revealed by expanding a job row. */
function JobDetailPanel({ job }: { job: JobListItemDto }) {
  const duration = formatDuration(job);
  const hasConfig = !!job.config && Object.keys(job.config).length > 0;

  return (
    <div className="space-y-5 border-l-2 border-primary/40 bg-muted/30 px-4 py-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Job ID">
          <span className="font-mono text-xs">{job.id}</span>
        </Field>
        <Field label="Status">
          <JobStatusBadge status={job.status as JobStatus} />
        </Field>
        <Field label="Category">
          <span className="capitalize">{job.category.replace(/_/g, ' ')}</span>
        </Field>
        <Field label="Priority">{job.priority ?? '—'}</Field>
        <Field label="Worker">
          <span className="font-mono text-xs">{job.workerId || '—'}</span>
        </Field>
        <Field label="Retries">{job.retryCount ?? 0}</Field>
        <Field label="Created">{formatDate(job.createdAt)}</Field>
        <Field label="Picked up">{formatDate(job.pickJobAt)}</Field>
        <Field label="Completed">{formatDate(job.completedAt)}</Field>
        <Field label="Duration">{duration ?? '—'}</Field>
        <Field label="Asset">
          {job.asset?.id ? (
            <Link
              to="/assets/$id"
              params={{ id: job.asset.id }}
              className="hover:underline"
            >
              {job.asset.value}
            </Link>
          ) : (
            (job.asset?.value ?? '—')
          )}
        </Field>
        <Field label="Asset service">
          {job.assetServiceId ? (
            <Link
              to="/assets/$id"
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

      {job.command && <CodeBlock language="command" value={job.command} />}

      {hasConfig && (
        <CodeBlock
          language="config (secrets masked)"
          value={JSON.stringify(job.config, null, 2)}
        />
      )}

      {!!job.errorLogs?.length && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" />
            Error logs ({job.errorLogs.length})
          </span>
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
}

export default function Runs() {
  const { id: jobHistoryId } = useParams({ strict: false });
  const queryClient = useQueryClient();

  const { hasPermission } = usePermission();
  const { mutate: deleteJobMutate } = useJobsRegistryControllerDeleteJob();
  const { mutate: cancelJobMutate } = useJobsRegistryControllerCancelJob();
  const {
    mutate: cancelRunMutate,
    isPending: isCancellingRun,
  } = useJobsRegistryControllerCancelJobHistory();

  const { tableParams, tableHandlers } = useServerDataTable({
    defaultPage: 1,
    defaultPageSize: 10,
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'DESC',
    isUpdateSearchQueryParam: false,
  });

  const hasActiveJobsRef = useRef(false);

  const { data: jobHistoryDetail } =
    useJobsRegistryControllerGetJobHistoryDetail(jobHistoryId || '', {
      query: {
        // Poll only while any tool in this run is still active.
        // The function form is evaluated lazily by React Query, so it always
        // reads the latest value without re-creating the query config.
        refetchInterval: () => (hasActiveJobsRef.current ? 1000 : false),
      },
    });

  // Check if any tools are still active via API status
  const hasActiveJobs = useMemo(() => {
    const tools = jobHistoryDetail?.tools || [];
    return tools.some(
      (tool) =>
        tool.status === JobStatus.pending ||
        tool.status === JobStatus.in_progress,
    );
  }, [jobHistoryDetail?.tools]);

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
        refetchInterval: hasActiveJobs ? 1000 : false,
      },
    },
  );

  /** Re-reads both the run summary (active job count) and the job table. */
  const refresh = () => {
    queryClient.invalidateQueries({
      queryKey: getJobsRegistryControllerGetJobHistoryDetailQueryKey(
        jobHistoryId || '',
      ),
    });
    queryClient.invalidateQueries({ queryKey: paginatedJobsQueryKey });
  };

  const activeJobsCount = jobHistoryDetail?.activeJobsCount ?? 0;

  const columns: ColumnDef<JobListItemDto>[] = [
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
            <span className="text-muted-foreground">No tool assigned</span>
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
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                {canCancel && (
                  <ConfirmDialog
                    title="Cancel Job"
                    description="Are you sure you want to cancel this job?"
                    onConfirm={() =>
                      cancelJobMutate({ id: row.original.id }, { onSuccess: refresh })
                    }
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        Cancel
                      </DropdownMenuItem>
                    }
                  />
                )}
                <ConfirmDialog
                  title="Delete Job"
                  description="Are you sure you want to delete this job?"
                  onConfirm={() =>
                    deleteJobMutate({ id: row.original.id }, { onSuccess: refresh })
                  }
                  trigger={
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(e) => e.preventDefault()}
                    >
                      Delete
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <Page
      permission="job.read"
      isShowButtonGoBack
      title={
        jobHistoryDetail?.jobHistoryName ||
        jobHistoryDetail?.workflowName ||
        'Job History Detail'
      }
      action={
        activeJobsCount > 0 &&
        hasPermission('job.write') && (
          <ConfirmDialog
            title="Cancel this run?"
            description={`Stops the ${activeJobsCount} job(s) still pending or running and prevents the workflow from starting any further step. Jobs that already finished keep their result.`}
            confirmText="Cancel run"
            disabled={isCancellingRun}
            onConfirm={() =>
              cancelRunMutate({ id: jobHistoryId || '' }, { onSuccess: refresh })
            }
            trigger={
              <Button variant="outline" disabled={isCancellingRun}>
                <Ban className="h-4 w-4" />
                Cancel run
              </Button>
            }
          />
        )
      }
    >
      {/* Tools Section */}
      {!!jobHistoryDetail?.tools?.length && (
        <Card className="mb-6 py-2">
          <CardContent className="px-2 py-2 md:px-4">
            <CardTitle className="mb-3">Tools</CardTitle>
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
          jobsError ? 'Failed to load jobs. Please try again.' : 'No jobs found'
        }
        onPageChange={tableHandlers.setPage}
        onPageSizeChange={tableHandlers.setPageSize}
        collapsibleElement={(job) => <JobDetailPanel job={job} />}
      />
    </Page>
  );
}
