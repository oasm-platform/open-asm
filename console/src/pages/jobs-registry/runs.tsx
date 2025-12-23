import type { ColumnDef } from '@tanstack/react-table';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { CodeBlock } from '@/components/common/code-block';
import Page from '@/components/common/page';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Image from '@/components/ui/image';
import JobStatusBadge from '@/components/ui/job-status';
import type { Job } from '@/services/apis/gen/queries';
import {
  JobStatus,
  useJobsRegistryControllerGetJobHistoryDetail,
  useJobsRegistryControllerGetManyJobs,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import { Calendar, Clock } from 'lucide-react';
import { useState } from 'react';

export default function Runs() {
  const { id: jobHistoryId } = useParams<{ id: string }>();
  const [jobError, setJobError] = useState<Job | null>();
  const [page, setPage] = useState(1);
  const { data: jobHistoryDetail } =
    useJobsRegistryControllerGetJobHistoryDetail(jobHistoryId || '');
  const [pageSize, setPageSize] = useState(100);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  const { data, isLoading } = useJobsRegistryControllerGetManyJobs({
    search: '',
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
    jobHistoryId: jobHistoryId || '',
  });

  console.log(jobHistoryDetail);

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

            <span className="flex gap-2 items-center">
              <Clock size={20} />
              {hours > 0 && `${hours}h `}
              {minutes > 0 && `${minutes}m `}
              {seconds}s
            </span>
          </div>
        );
      },
    },
  ];

  const navigate = useNavigate();
  return (
    <Page isShowButtonGoBack title="Jobs registry - runs">
      <DataTable
        isShowHeader={false}
        columns={columns}
        data={data?.data || []}
        isLoading={isLoading}
        page={data?.page || 1}
        pageSize={data?.limit || 100}
        totalItems={data?.total || 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(newSortBy, newSortOrder) => {
          setSortBy(newSortBy);
          setSortOrder(newSortOrder);
          setPage(1); // Reset to first page when sorting changes
        }}
        showColumnVisibility={true}
        showPagination={true}
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
