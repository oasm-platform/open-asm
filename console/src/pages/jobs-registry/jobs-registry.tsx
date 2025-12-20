import Page from '@/components/common/page';
import { DataTable } from '@/components/ui/data-table';
import Image from '@/components/ui/image';
import JobStatusBadge from '@/components/ui/job-status';
import {
  type Job,
  JobStatus,
  useJobsRegistryControllerGetManyJobs,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Calendar, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
dayjs.extend(duration);

const JobsRegistryPage = () => {
  const navigate = useNavigate();
  const {
    data: jobsData,
    isLoading,
    isError,
    error,
  } = useJobsRegistryControllerGetManyJobs(
    {
      page: 1,
      limit: 100,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    },
    {
      query: {
        enabled: true,
      },
    },
  );

  const columns: ColumnDef<Job>[] = [
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const value = row?.original?.assetService
          ? `${row.original.assetService.value}`
          : row?.original?.asset?.value;
        return (
          <div className="flex items-center gap-2">
            <JobStatusBadge
              onlyIcon
              status={row.original.status as JobStatus}
            />
            <pre className="font-bold ">{value}</pre>
          </div>
        );
      },
    },
    {
      accessorKey: 'tool',
      header: 'Tool',
      cell: ({ row }) => {
        const { tool } = row.original;
        if (!tool)
          return (
            <div className="min-h-[60px] flex items-center justify-center">
              -
            </div>
          );
        return (
          <div className="min-h-[60px] flex items-center">
            <Link to={`/tools/${tool.id}`} className="flex items-center gap-2">
              <Image
                url={tool?.logoUrl}
                width={30}
                height={30}
                className="rounded-full"
              />
              <span className="capitalize font-bold">{tool.name}</span>
            </Link>
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created At',
      cell: ({ row }) => {
        const job = row.original;
        const createdAt = new Date(job.updatedAt);
        let durationText = '';

        if (job.completedAt) {
          const completedAt = new Date(job.completedAt);
          const durationInSeconds = Math.floor(
            (completedAt.getTime() - createdAt.getTime()) / 1000,
          );

          const duration = dayjs.duration(durationInSeconds, 'seconds');
          const hours = duration.hours();
          const minutes = duration.minutes();
          const seconds = duration.seconds();

          const timeParts = [];
          if (hours > 0) timeParts.push(`${hours}h`);
          if (minutes > 0) timeParts.push(`${minutes}m`);
          if (seconds > 0) timeParts.push(`${seconds}s`);

          durationText = timeParts.length > 0 ? timeParts.join(' ') : '0s';
        }

        return (
          <div className="flex flex-col text-muted-foreground text-xs gap-3">
            <span className="flex items-center gap-1">
              <Calendar size={20} />
              {createdAt.toLocaleString()}
            </span>
            {durationText && (
              <span className="flex items-center gap-1 font-medium">
                <Clock size={20} />
                {durationText}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  if (isError) {
    return (
      <div className="p-4">
        <div className="text-destructive">
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load jobs'}
        </div>
      </div>
    );
  }

  return (
    <Page>
      <DataTable
        isShowHeader={false}
        columns={columns}
        data={jobsData?.data || []}
        isLoading={isLoading}
        page={jobsData?.page || 1}
        pageSize={jobsData?.limit || 100}
        totalItems={jobsData?.total || 100}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        showPagination={true}
        onRowClick={(row: Job) => {
          const isAssetService = row.assetService?.id !== undefined;
          if (row.status !== (JobStatus.pending || JobStatus.failed)) {
            navigate(
              isAssetService
                ? `/assets/${row.assetService?.id}`
                : `/assets?filter=${row.asset?.value}`,
            );
          }
        }}
        // filterColumnKey="category"
        // filterPlaceholder="Filter by category..."
      />
    </Page>
  );
};

export default JobsRegistryPage;
