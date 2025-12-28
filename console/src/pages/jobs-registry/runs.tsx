import type { ColumnDef } from '@tanstack/react-table';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { CodeBlock } from '@/components/common/code-block';
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
import type { Job } from '@/services/apis/gen/queries';
import {
  JobStatus,
  useJobsRegistryControllerCancelJob,
  useJobsRegistryControllerDeleteJob,
  useJobsRegistryControllerGetJobHistoryDetail,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  ArrowRight,
  Calendar,
  CircleCheck,
  Clock,
  Loader2Icon,
  MoreHorizontal,
} from 'lucide-react';
import { useMemo, useState } from 'react';

export default function Runs() {
  const { id: jobHistoryId } = useParams<{ id: string }>();
  const [jobError, setJobError] = useState<Job | null>();
  const queryClient = useQueryClient();
  const { data: jobHistoryDetail } =
    useJobsRegistryControllerGetJobHistoryDetail(jobHistoryId || '', {
      query: {
        refetchInterval: 1000,
      },
    });

  const { mutate: deleteJobMutate } = useJobsRegistryControllerDeleteJob();
  const { mutate: cancelJobMutate } = useJobsRegistryControllerCancelJob();

  // Memoize jobs grouped by tool ID for efficient lookups
  const jobsByToolId = useMemo(() => {
    if (!jobHistoryDetail?.jobs) return new Map<string, Job[]>();
    return jobHistoryDetail.jobs.reduce((acc, job) => {
      const toolId = job.tool.id;
      if (!acc.has(toolId)) {
        acc.set(toolId, []);
      }
      acc.get(toolId)!.push(job);
      return acc;
    }, new Map<string, Job[]>());
  }, [jobHistoryDetail?.jobs]);

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
          <Link
            to={`/tools/${row.original.tool.id}`}
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
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      cell: ({ row }) => {
        const updatedAt = dayjs(row.original.updatedAt);
        const completedAt = dayjs(row.original.completedAt);

        // Total seconds between createdAt and completedAt
        const totalSeconds = completedAt.diff(updatedAt, 'second');

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return (
          <div className="text-sm text-muted-foreground flex flex-col gap-2">
            <span className="flex gap-2 items-center">
              <Calendar size={20} />
              {updatedAt.format('YYYY-MM-DD HH:mm:ss')}
            </span>

            {row.original.status !== JobStatus.in_progress && (
              <span className="flex gap-2 items-center">
                <Clock size={20} />
                {hours > 0 && `${hours}h `}
                {minutes > 0 && `${minutes}m `}
                {seconds}s
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

  const getToolStatus = useMemo(() => {
    return (toolIndex: number) => {
      const tools = jobHistoryDetail?.tools || [];

      // Check if any previous tool in the workflow is still running
      for (let i = 0; i < toolIndex; i++) {
        const prevTool = tools[i];
        const prevToolJobs = jobsByToolId.get(prevTool.id) || [];

        if (prevToolJobs.length > 0) {
          const hasPrevRunning = prevToolJobs.some(
            (job) => job.status === JobStatus.in_progress,
          );
          if (hasPrevRunning) return 'running';

          const allPrevCompleted = prevToolJobs.every(
            (job) => job.status === JobStatus.completed,
          );
          if (!allPrevCompleted) return 'running';
        }
      }

      // Check current tool jobs
      const currentTool = tools[toolIndex];
      const currentToolJobs = jobsByToolId.get(currentTool.id) || [];

      if (currentToolJobs.length === 0) return null;

      const hasRunning = currentToolJobs.some(
        (job) => job.status === JobStatus.in_progress,
      );
      if (hasRunning) return 'running';

      const allCompleted = currentToolJobs.every(
        (job) => job.status === JobStatus.completed,
      );
      if (allCompleted) return 'completed';

      return 'running';
    };
  }, [jobHistoryDetail?.tools, jobsByToolId]);

  // Memoize sorted jobs to avoid sorting on every render
  const sortedJobs = useMemo(() => {
    // Use .slice() to create a shallow copy before sorting to avoid mutating the original array
    return (jobHistoryDetail?.jobs || [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [jobHistoryDetail?.jobs]);

  const navigate = useNavigate();
  return (
    <Page isShowButtonGoBack title="Jobs registry - runs">
      {/* Tools Section */}
      {jobHistoryDetail?.tools && jobHistoryDetail.tools.length > 0 && (
        <div className="mb-6 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-4">Workflow</h3>
          <div className="flex items-center gap-4 flex-wrap">
            {jobHistoryDetail.tools.map((tool, index) => {
              const status = getToolStatus(index);
              return (
                <div key={tool.id} className="flex items-center gap-2">
                  <Link
                    to={`/tools/${tool.id}`}
                    className="flex items-center gap-2 hover:opacity-80"
                  >
                    <Image
                      url={tool.logoUrl}
                      width={40}
                      height={40}
                      className="rounded-full border"
                    />
                    <span className="font-medium">{tool.name}</span>
                    {status === 'running' && (
                      <Loader2Icon className="animate-spin h-4 w-4" />
                    )}
                    {status === 'completed' && (
                      <CircleCheck className="text-green-500" />
                    )}
                  </Link>
                  {index < jobHistoryDetail.tools.length - 1 && (
                    <ArrowRight className="text-muted-foreground" size={16} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <DataTable
        isShowHeader={false}
        columns={columns}
        data={sortedJobs}
        showColumnVisibility={true}
        showPagination={false}
        page={1}
        pageSize={jobHistoryDetail?.jobs?.length || 0}
        totalItems={jobHistoryDetail?.jobs?.length || 0}
        onRowClick={(row) => {
          if (row.status === JobStatus.failed) {
            setJobError(row);
            return;
          }
          const redirect = row.assetServiceId
            ? `/assets/${row.assetServiceId}`
            : `/assets?filter=${row?.asset?.value}`;
          navigate(redirect);
        }}
      />
      <Dialog open={!!jobError} onOpenChange={() => setJobError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{jobError && getTitle(jobError)}</DialogTitle>
            {jobError?.errorLogs.map((errorLog) => (
              <div className="mb-1 flex flex-col border-b-2" key={errorLog.id}>
                <CodeBlock
                  language="Payload"
                  value={String(errorLog.payload).replace(/\n$/, '')}
                />
                <CodeBlock
                  language="Log Message"
                  value={String(errorLog.logMessage).replace(/\n$/, '')}
                />
              </div>
            ))}
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
