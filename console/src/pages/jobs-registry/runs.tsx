import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';

import Page from '@/components/common/page';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Image from '@/components/ui/image';
import JobStatusBadge from '@/components/ui/job-status';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import type { Job } from '@/services/apis/gen/queries';
import {
  JobStatus,
  useJobsRegistryControllerCancelJob,
  useJobsRegistryControllerDeleteJob,
  useJobsRegistryControllerGetJobHistoryDetail,
  useJobsRegistryControllerGetManyJobs,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  ArrowRight,
  Calendar,
  CircleAlert,
  CircleCheck,
  Clock,
  Loader2Icon,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

export default function Runs() {
  const { id: jobHistoryId } = useParams({ strict: false });
  const [jobError, setJobError] = useState<Job | null>();
  const queryClient = useQueryClient();

  const { mutate: deleteJobMutate } = useJobsRegistryControllerDeleteJob();
  const { mutate: cancelJobMutate } = useJobsRegistryControllerCancelJob();

  const { tableParams, tableHandlers } = useServerDataTable({
    defaultPage: 1,
    defaultPageSize: 10,
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'DESC',
    isUpdateSearchQueryParam: false,
  });

  const { data: jobHistoryDetail } =
    useJobsRegistryControllerGetJobHistoryDetail(jobHistoryId || '', {
      query: {
        refetchInterval: 1000,
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

  const getTitle = (row: Job) => {
    const value = row?.assetService
      ? `${row.assetService.value}`
      : row?.asset?.value;
    return value;
  };

  const columns: ColumnDef<Job>[] = [
    {
      accessorKey: 'status',
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-2">
            <JobStatusBadge
              onlyIcon
              status={row.original.status as JobStatus}
            />
            <pre>{getTitle(row.original)}</pre>
          </div>
        );
      },
    },
    {
      accessorKey: 'tool',
      cell: ({ row }) => (
        <div className="min-h-[60px] flex items-center">
          {row.original.tool ? (
            <Link
              to="/tools/$id"
              params={{ id: row.original.tool.id }}
              className="flex items-center gap-2"
            >
              <Image
                url={row.original.tool?.logoUrl}
                width={30}
                height={30}
                className="rounded-full"
              />
              <span className="capitalize font-bold">
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
      accessorKey: 'createdAt',
      cell: ({ row }) => {
        const updatedAt = dayjs(row.original.updatedAt);
        const pickJobAt = dayjs(row.original.pickJobAt);
        const completedAt = dayjs(row.original.completedAt);

        // Calculate duration only if all dates are valid and job is completed
        const isValidDates =
          pickJobAt.isValid() &&
          completedAt.isValid() &&
          row.original.status === JobStatus.completed;

        let durationDisplay = null;

        if (isValidDates) {
          const totalSeconds = completedAt.diff(pickJobAt, 'second');

          // Only display if duration is positive
          if (totalSeconds >= 0) {
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            const parts = [];
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0) parts.push(`${minutes}m`);
            parts.push(`${seconds}s`);

            durationDisplay = parts.join(' ');
          }
        }

        return (
          <div className="text-sm text-muted-foreground flex flex-col gap-2">
            <span className="flex gap-2 items-center">
              <Calendar size={20} />
              {updatedAt.format('YYYY-MM-DD HH:mm:ss')}
            </span>

            {durationDisplay && (
              <span className="flex gap-2 items-center">
                <Clock size={20} />
                {durationDisplay}
              </span>
            )}
          </div>
        );
      },
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
                  className="h-8 w-8 p-0 flex items-center justify-center"
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
                      cancelJobMutate(
                        { id: row.original.id },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({
                              queryKey: [
                                'JobsRegistryControllerGetJobHistoryDetail',
                                jobHistoryId,
                              ],
                            });
                            queryClient.invalidateQueries({
                              queryKey: paginatedJobsQueryKey,
                            });
                          },
                        },
                      )
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
                    deleteJobMutate(
                      { id: row.original.id },
                      {
                        onSuccess: () => {
                          queryClient.invalidateQueries({
                            queryKey: [
                              'JobsRegistryControllerGetJobHistoryDetail',
                              jobHistoryId,
                            ],
                          });
                          queryClient.invalidateQueries({
                            queryKey: paginatedJobsQueryKey,
                          });
                        },
                      },
                    )
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

  const navigate = useNavigate();
  return (
    <Page
      isShowButtonGoBack
      title={
        jobHistoryDetail?.jobHistoryName ||
        jobHistoryDetail?.workflowName ||
        'Job History Detail'
      }
    >
      {/* Tools Section */}
      {!!jobHistoryDetail?.tools?.length && (
        <div className="mb-6 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-4">Pipeline</h3>
          <div className="flex items-center gap-4 flex-wrap">
            {jobHistoryDetail.tools.map((tool, index) => (
              <div key={tool.id} className="flex items-center gap-2">
                <Link
                  to="/tools/$id"
                  params={{ id: tool.id }}
                  className="flex items-center gap-2 hover:opacity-80"
                >
                  <Image
                    url={tool.logoUrl}
                    width={40}
                    height={40}
                    className="rounded-full border"
                  />
                  <span className="font-medium">{tool.name}</span>
                  {tool.status === JobStatus.in_progress && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {tool.status === JobStatus.completed && (
                    <CircleCheck className="text-green-500" />
                  )}
                  {tool.status === JobStatus.pending && (
                    <Clock className="text-yellow-500" />
                  )}
                  {tool.status === JobStatus.failed && (
                    <X className="text-red-500" />
                  )}
                  {tool.status === JobStatus.skipped && (
                    <CircleAlert className="text-gray-400" />
                  )}
                </Link>
                {index < jobHistoryDetail.tools.length - 1 && (
                  <ArrowRight className="text-muted-foreground" size={16} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!!jobsError && (
        <div className="mb-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          Failed to load jobs. Please try again.
        </div>
      )}

      <DataTable
        isShowHeader={false}
        columns={columns}
        data={paginatedJobsData?.data || []}
        isLoading={isLoadingJobs}
        showColumnVisibility={true}
        showPagination={true}
        page={paginatedJobsData?.page || 1}
        pageSize={paginatedJobsData?.limit || 10}
        totalItems={paginatedJobsData?.total || 0}
        onPageChange={tableHandlers.setPage}
        onPageSizeChange={tableHandlers.setPageSize}
        onRowClick={(row) => {
          if (row.status === JobStatus.failed) {
            setJobError(row);
            return;
          }
          if (row.assetServiceId) {
            navigate({ to: `/assets/${row.assetServiceId}` });
          } else {
            navigate({ to: '/assets', search: { filter: row?.asset?.value } });
          }
        }}
      />
      <Dialog open={!!jobError} onOpenChange={() => setJobError(null)}>
        <DialogContent className="max-h-[80vh] flex flex-col max-w-2xl">
          <DialogHeader>
            <DialogTitle>{jobError && getTitle(jobError)}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-3">
            {jobError?.errorLogs?.map((errorLog, index) => (
              <div
                className="rounded-lg border bg-muted/50 p-3"
                key={errorLog.id}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Error {index + 1}
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                      Payload
                    </span>
                    <pre className="text-sm font-mono bg-background rounded p-2 overflow-x-auto">
                      {String(errorLog.payload).replace(/\n$/, '')}
                    </pre>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                      Message
                    </span>
                    <pre className="text-sm font-mono bg-background rounded p-2 overflow-x-auto text-destructive">
                      {String(errorLog.logMessage).replace(/\n$/, '')}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
