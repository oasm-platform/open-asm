import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(duration);
dayjs.extend(relativeTime);

import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import {
  JobStatus,
  TargetScopeType,
  TargetType,
  useTargetsControllerGetTargetsInWorkspace,
} from '@/services/apis/gen/queries';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import JobStatusBadge from '@/components/ui/job-status';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type { GetManyTargetResponseDto } from '@/services/apis/gen/queries';
import { Target } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScanStatusFilter } from './components/scan-status-filter';
import { TargetTypeFilter } from './components/target-type-filter';
import { ScopeFilter } from './components/scope-filter';

const targetTypeColor: Record<string, string> = {
  DOMAIN: 'border-blue-500 text-blue-500',
  CIDR: 'border-green-500 text-green-500',
  IP: 'border-orange-500 text-orange-500',
};

const targetColumns: ColumnDef<GetManyTargetResponseDto>[] = [
  {
    accessorKey: 'value',
    header: 'Target',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{row.getValue('value')}</span>
        {row.original.internalNetworkId && (
          <Badge variant="secondary" className="text-xs">
            Internal
          </Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.original.type as TargetType;
      return (
        <Badge variant="outline" className={targetTypeColor[type]}>
          {type}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'totalAssetServices',
    header: 'Services',
    cell: ({ row }) => {
      const value: string = row.getValue('totalAssetServices');
      return (
        <div>
          <b>{value}</b> services
        </div>
      );
    },
  },
  // {
  //   accessorKey: 'duration',
  //   header: 'Duration',
  //   cell: ({ row }) => {
  //     const status = row.getValue('status');
  //     if (status === 'in_progress') {
  //       return null;
  //     }

  //     const value: number = parseInt(row.getValue('duration'));
  //     const duration = dayjs.duration(value, 'seconds');
  //     const hours = duration.hours();
  //     const minutes = duration.minutes();
  //     const seconds = duration.seconds();

  //     return (
  //       <div className="text-gray-400 font-semibold">
  //         {hours > 0 && `${hours}h`}
  //         {minutes > 0 && `${minutes}m`}
  //         {seconds > 0 && `${seconds}s`}
  //       </div>
  //     );
  //   },
  // },
  {
    accessorKey: 'lastDiscoveredAt',
    header: 'Last Discovery',
    cell: ({ row }) => {
      const value: string = row.getValue('lastDiscoveredAt');
      return (
        <div className="text-gray-400 font-semibold">
          {dayjs(value).fromNow()}
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Scan status',
    cell: ({ row }) => {
      const value: JobStatus = row.getValue('status');
      return <JobStatusBadge status={value} />;
    },
  },
];

export function ListTargets() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize type filter from URL params
  const urlType = searchParams.get('type') as TargetType | null;
  const [typeFilter, setTypeFilter] = useState<TargetType | undefined>(
    urlType ?? undefined,
  );

  // Initialize status filter from URL params
  const urlStatus = searchParams.get('status') as JobStatus | null;
  const [statusFilter, setStatusFilter] = useState<JobStatus | undefined>(
    urlStatus ?? undefined,
  );

  // Initialize scope filter from URL params
  const urlScope = searchParams.get('scope') as TargetScopeType | null;
  const [scopeFilter, setScopeFilter] = useState<TargetScopeType | undefined>(
    urlScope as TargetScopeType ?? undefined,
  );

  /** Sync type filter to URL search params */
  const handleTypeFilterChange = (newType: TargetType | undefined) => {
    setTypeFilter(newType);

    const newParams = new URLSearchParams(searchParams);
    if (newType) {
      newParams.set('type', newType);
    } else {
      newParams.delete('type');
    }
    setSearchParams(newParams, { replace: true });
  };

  /** Sync status filter to URL search params */
  const handleStatusFilterChange = (newStatus: JobStatus | undefined) => {
    setStatusFilter(newStatus);

    const newParams = new URLSearchParams(searchParams);
    if (newStatus) {
      newParams.set('status', newStatus);
    } else {
      newParams.delete('status');
    }
    setSearchParams(newParams, { replace: true });
  };

  /** Sync scope filter to URL search params */
  const handleScopeFilterChange = (newValue: TargetScopeType | undefined) => {
    setScopeFilter(newValue);

    const newParams = new URLSearchParams(searchParams);
    if (newValue) {
      newParams.set('scope', newValue);
    } else {
      newParams.delete('scope');
    }
    setSearchParams(newParams, { replace: true });
  };

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable();

  const { data, isLoading, refetch } =
    useTargetsControllerGetTargetsInWorkspace(
      {
        limit: pageSize,
        page,
        sortBy,
        sortOrder,
        value: filter,
        type: typeFilter,
        status: statusFilter,
        scope: scopeFilter,
      },
      {
        query: {
          refetchInterval: 3000,
          queryKey: [
            'targets',
            selectedWorkspaceId,
            pageSize,
            page,
            sortBy,
            sortOrder,
            filter,
            typeFilter,
            statusFilter,
            scopeFilter,
          ],
        },
      },
    );

  const targets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return (
      <DataTableError message="Failed to load targets." onRetry={refetch} />
    );

  const handleRowClick = (target: GetManyTargetResponseDto) => {
    navigate(`/targets/${target.id}/asset-services`);
  };

  return (
    <DataTable
      data={targets}
      columns={targetColumns}
      isLoading={isLoading}
      page={page}
      pageSize={pageSize}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      onSortChange={(col, order) => {
        setParams({ sortBy: col, sortOrder: order });
      }}
      filterColumnKey="value"
      filterValue={filter}
      onFilterChange={setFilter}
      toolbarComponents={[
        <TargetTypeFilter
          key="type-filter"
          value={typeFilter}
          onValueChange={handleTypeFilterChange}
        />,
        <ScanStatusFilter
          key="status-filter"
          value={statusFilter}
          onValueChange={handleStatusFilterChange}
        />,
        <ScopeFilter
          key="scope-filter"
          value={scopeFilter}
          onValueChange={handleScopeFilterChange}
        />,
        // <ExportDataButton api="api/targets/export" prefix="targets" />,
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => navigate('/targets/start-discovery')}
        >
          <Target className="shrink-0" />
          <span>Start discovery</span>
        </Button>,
      ]}
      totalItems={total}
      onRowClick={handleRowClick}
      rowClassName="cursor-pointer hover:bg-muted/50 transition-colors"
    />
  );
}
