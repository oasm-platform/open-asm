import Page from '@/components/common/page';
import { DataTable } from '@/components/ui/data-table';
import JobStatusBadge from '@/components/ui/job-status';
import {
  type JobHistoryResponseDto,
  JobStatus,
  useJobsRegistryControllerGetManyJobHistories,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
dayjs.extend(duration);

const JobsRegistryPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  const {
    data: jobsData,
    isLoading,
    isError,
    error,
  } = useJobsRegistryControllerGetManyJobHistories(
    {
      page,
      limit: pageSize,
      sortBy,
      sortOrder,
    },
    {
      query: {
        enabled: true,
      },
    },
  );

  const columns: ColumnDef<JobHistoryResponseDto>[] = [
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-2">
            <JobStatusBadge
              onlyIcon
              status={row.original.status as JobStatus}
            />
            <pre>{row.original?.workflowName || 'Manual run'}</pre>
          </div>
        );
      },
    },
    {
      accessorKey: 'totalJobs',
      header: 'Total jobs',
      cell: ({ row }) => {
        return (
          <div>
            <b>{row.original.totalJobs}</b> jobs
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
        return (
          <div className="flex flex-col text-muted-foreground text-xs gap-3">
            <span className="flex items-center gap-1">
              <Calendar size={20} />
              {createdAt.toLocaleString()}
            </span>
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
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(newSortBy, newSortOrder) => {
          setSortBy(newSortBy);
          setSortOrder(newSortOrder);
          setPage(1); // Reset to first page when sorting changes
        }}
        showPagination={true}
        onRowClick={(row) => {
          navigate(`/jobs/runs/${row.id}`);
        }}
      />
    </Page>
  );
};

export default JobsRegistryPage;
