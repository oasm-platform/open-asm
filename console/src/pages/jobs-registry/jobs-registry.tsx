import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { DatePickerWithRange } from '@/components/ui/date-picker-range';
import JobStatusBadge from '@/components/ui/job-status';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  type JobHistoryResponseDto,
  JobStatus,
  type JobsRegistryControllerGetManyJobHistoriesJobRunType,
  type JobsRegistryControllerGetManyJobHistoriesJobStatus,
  useJobsRegistryControllerGetManyJobHistories,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { useNavigate, useSearch } from '@tanstack/react-router';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  RunStatusFilter,
  RunTypeFilter,
} from './components/run-status-filter';
dayjs.extend(duration);

/** Every filter except search lives in its own URL param, next to the table's
 * own params, so a filtered view is shareable and survives a reload. */
const ALL = 'all';

const readParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) || ALL;

/** `undefined` unless both ends of the range are present. */
const readDateParam = (value: string | string[] | undefined) => {
  const raw = readParam(value);
  return raw === ALL ? undefined : raw;
};

const JobsRegistryPage = () => {
  const navigate = useNavigate();
  const urlSearch = useSearch({ strict: false }) as Record<
    string,
    string | string[]
  >;
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setParams, setFilter },
  } = useServerDataTable();

  const statusFilter = readParam(urlSearch.status);
  const runTypeFilter = readParam(urlSearch.jobRunType);

  const urlFrom = readDateParam(urlSearch.createdFrom);
  const urlTo = readDateParam(urlSearch.createdTo);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() =>
    urlFrom && urlTo
      ? { from: new Date(urlFrom), to: new Date(urlTo) }
      : undefined,
  );

  /** Reset to page 1 and merge one param; `undefined` drops it from the URL. */
  const setFilterParam = useCallback(
    (key: string, value: string | undefined) => {
      navigate({
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          [key]: value,
          page: undefined,
        })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        createdFrom: range?.from ? format(range.from, 'yyyy-MM-dd') : undefined,
        createdTo: range?.to ? format(range.to, 'yyyy-MM-dd') : undefined,
        page: undefined,
      })) as never,
      replace: true,
    });
  };

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
      search: filter,
      jobStatus:
        statusFilter as JobsRegistryControllerGetManyJobHistoriesJobStatus,
      jobRunType:
        runTypeFilter as JobsRegistryControllerGetManyJobHistoriesJobRunType,
      createdFrom: urlFrom,
      createdTo: urlTo,
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
            <span className="font-medium">
              {row.original?.jobHistoryName ||
                row.original?.workflowName ||
                'Manual run'}
            </span>
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
        const createdAt = new Date(job.createdAt);
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
    {
      accessorKey: 'jobRunType',
      header: 'Run Type',
      cell: ({ row }) => {
        return (
          <Badge variant="outline">
            <span className="text-xs font-medium capitalize">
              {row.original?.jobRunType || 'manual'}
            </span>
          </Badge>
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
    <Page
      title="Jobs Registry"
      description="Every scan run in this workspace, newest first."
      permission="job.read"
    >
      <DataTable
        isShowHeader={false}
        columns={columns}
        data={jobsData?.data || []}
        isLoading={isLoading}
        page={jobsData?.page ?? page}
        pageSize={jobsData?.limit ?? pageSize}
        totalItems={jobsData?.total ?? 0}
        emptyMessage="No jobs found"
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setParams({ sortBy: col, sortOrder: order, page: 1 });
        }}
        filterColumnKey="__search__"
        filterValue={filter}
        onFilterChange={setFilter}
        toolbarComponents={[
          <div key="filters" className="flex items-center gap-2">
            <DatePickerWithRange
              label="Date"
              value={dateRange}
              onChange={handleDateRangeChange}
            />
            <RunTypeFilter
              value={runTypeFilter}
              onValueChange={(value) =>
                setFilterParam('jobRunType', value === ALL ? undefined : value)
              }
            />
            <RunStatusFilter
              value={statusFilter}
              onValueChange={(value) =>
                setFilterParam('status', value === ALL ? undefined : value)
              }
            />
          </div>,
        ]}
        showPagination={true}
        onRowClick={(row) => {
          navigate({ to: `/jobs/runs/${row.id}` });
        }}
      />
    </Page>
  );
};

export default JobsRegistryPage;
