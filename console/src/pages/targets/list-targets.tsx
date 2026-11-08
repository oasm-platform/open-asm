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
import { useMemo, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { Badge } from '@/components/ui/badge';
import Image from '@/components/ui/image';
import LogoFrame from '@/components/ui/logo-frame';
import JobStatusBadge from '@/components/ui/job-status';
import { Progress } from '@/components/ui/progress';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type { GetManyTargetResponseDto } from '@/services/apis/gen/queries';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { SeverityBar, SeverityCounts } from '../projects/components/severity-bar';
import { totalOf } from '../projects/project-utils';
import { ScanStatusFilter } from './components/scan-status-filter';
import { ScopeFilter } from './components/scope-filter';
import { StartDiscoveryButton } from './components/start-discovery-button';
import { TargetBulkActions } from './components/target-bulk-actions';
import { TargetLogo } from './components/target-logo';
import { TargetTypeBadge } from './components/target-type-badge';
import { TargetTypeFilter } from './components/target-type-filter';
import { TargetsSummary, type TargetView } from './components/targets-summary';
import { isScheduled, progressPercent, scheduleLabel } from './target-utils';

interface TargetSourceCellProps {
  icon: string;
  source: string;
}

/** Source icon: tooltip on hover, navigates to the integration on click. */
function TargetSourceCell({ icon, source }: TargetSourceCellProps) {
  const navigate = useNavigate();
  // ponytail: appType parsed from icon path; cleaner would be exposing the raw source id in TargetSourceDto
  const tool = icon.split('/').pop()?.replace(/.svg$/, '') ?? '';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="flex cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            navigate({
              to: '/integrations',
              search: { tab: 'connected', tool } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            });
          }}
        >
          <LogoFrame className="rounded-md">
            <Image url={icon} width={16} height={16} />
          </LogoFrame>
        </span>
      </TooltipTrigger>
      <TooltipContent>Sync from {source}</TooltipContent>
    </Tooltip>
  );
}

/** Coloured dots of the projects the target's assets belong to. */
function ProjectDots({ projects }: { projects: GetManyTargetResponseDto['projects'] }) {
  if (!projects?.length) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center -space-x-1">
          {projects.slice(0, 3).map((project) => (
            <span
              key={project.id}
              className="size-2.5 rounded-full ring-2 ring-background"
              style={{ backgroundColor: project.hexColor ?? undefined }}
            />
          ))}
          {projects.length > 3 && (
            <span className="pl-1.5 text-xs text-muted-foreground">
              +{projects.length - 3}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {projects.map((project) => project.name).join(', ')}
      </TooltipContent>
    </Tooltip>
  );
}

const targetColumns: ColumnDef<GetManyTargetResponseDto>[] = [
  {
    accessorKey: 'value',
    header: 'Target',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <TargetLogo url={row.original.logo} />
        <span className="font-medium">{row.getValue('value')}</span>

        {row.original.source?.icon && (
          <TargetSourceCell
            icon={row.original.source.icon}
            source={row.original.source.source}
          />
        )}
        {row.original.internalNetworkId && (
          <Badge variant="secondary" className="text-xs">
            Internal
          </Badge>
        )}
        <ProjectDots projects={row.original.projects} />
      </div>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    enableSorting: false,
    cell: ({ row }) => <TargetTypeBadge type={row.original.type} />,
  },
  {
    accessorKey: 'totalAssetServices',
    header: 'Surface',
    cell: ({ row }) => {
      // A Git organization has no services; its size is its repositories.
      if (row.original.type === TargetType.GIT_ORG) {
        return (
          <div className="text-muted-foreground font-medium">
            {row.original.totalAssets} repositories
          </div>
        );
      }
      return (
        <div className="flex flex-col text-sm">
          <span className="font-medium">
            {row.original.totalAssetServices} services
          </span>
          <span className="text-muted-foreground">
            {row.original.totalAssets} assets
          </span>
        </div>
      );
    },
  },
  {
    id: 'vulnerabilities',
    header: 'Open vulnerabilities',
    enableSorting: false,
    cell: ({ row }) => {
      const counts = row.original.openVulnerabilities;
      if (!totalOf(counts)) {
        return <span className="text-sm text-muted-foreground">None</span>;
      }
      return (
        <div className="flex w-44 flex-col gap-1.5">
          <SeverityCounts
            counts={counts}
            className="flex-nowrap gap-x-2 [&>span]:text-xs"
          />
          <SeverityBar counts={counts} />
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Scan status',
    enableSorting: false,
    cell: ({ row }) => {
      const value: JobStatus = row.getValue('status');
      const progress = row.original.scanProgress;
      return (
        <div className="flex w-36 flex-col gap-1.5">
          <JobStatusBadge status={value} />
          {progress && progress.total > 0 && (
            <div className="flex items-center gap-2">
              <Progress
                value={progressPercent(progress.done, progress.total)}
                className="h-1.5"
              />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {progress.done}/{progress.total}
              </span>
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'lastDiscoveredAt',
    header: 'Last / next scan',
    cell: ({ row }) => {
      const { lastDiscoveredAt, nextScanAt, scanSchedule } = row.original;
      return (
        <div className="flex flex-col text-sm">
          <span className="font-medium" title={dayjs(lastDiscoveredAt).format('YYYY-MM-DD HH:mm')}>
            {dayjs(lastDiscoveredAt).fromNow()}
          </span>
          <span className="text-muted-foreground">
            {nextScanAt
              ? `next ${dayjs(nextScanAt).fromNow()}`
              : isScheduled(scanSchedule)
                ? scheduleLabel(scanSchedule)
                : 'manual'}
          </span>
        </div>
      );
    },
  },
];

const routeApi = getRouteApi('/_authed/targets/');

const VIEWS: TargetView[] = ['all', 'scanning', 'critical', 'stale'];
const isView = (value: unknown): value is TargetView =>
  VIEWS.includes(value as TargetView);

export function ListTargets() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const navigate = useNavigate({ from: '/targets/' });
  const search = routeApi.useSearch();

  // Initialize type filter from URL params
  const urlType = search.type as TargetType | undefined;
  const [typeFilter, setTypeFilter] = useState<TargetType | undefined>(
    urlType ?? undefined,
  );

  // Initialize status filter from URL params
  const urlStatus = search.status as JobStatus | undefined;
  const [statusFilter, setStatusFilter] = useState<JobStatus | undefined>(
    urlStatus ?? undefined,
  );

  // Initialize scope filter from URL params
  const urlScope = search.scope as TargetScopeType | undefined;
  const [scopeFilter, setScopeFilter] = useState<TargetScopeType | undefined>(
    (urlScope as TargetScopeType) ?? undefined,
  );

  // Quick view picked on the summary strip.
  const view: TargetView = isView(search.view) ? search.view : 'all';

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  /** Sync search params to the URL */
  const setSearch = (patch: Record<string, unknown>) =>
    navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        ...patch,
      })) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      replace: true,
    });

  /** Sync type filter to URL search params */
  const handleTypeFilterChange = (newType: TargetType | undefined) => {
    setTypeFilter(newType);
    setSearch({ type: newType || undefined });
  };

  /** Sync status filter to URL search params */
  const handleStatusFilterChange = (newStatus: JobStatus | undefined) => {
    setStatusFilter(newStatus);
    setSearch({
      status: newStatus || undefined,
      // "Scanning" is the in-progress status; another status leaves it.
      ...(view === 'scanning' ? { view: undefined } : {}),
    });
  };

  /** Sync scope filter to URL search params */
  const handleScopeFilterChange = (newValue: TargetScopeType | undefined) => {
    setScopeFilter(newValue);
    setSearch({ scope: newValue || undefined });
  };

  const handleViewChange = (next: TargetView) => {
    const status =
      next === 'scanning'
        ? JobStatus.in_progress
        : view === 'scanning'
          ? undefined
          : statusFilter;
    setStatusFilter(status);
    setRowSelection({});
    setSearch({
      view: next === 'all' ? undefined : next,
      status,
      page: undefined,
    });
  };

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable();

  const hasCritical = view === 'critical' || undefined;
  const stale = view === 'stale' || undefined;

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
        hasCritical,
        stale,
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
            hasCritical,
            stale,
          ],
        },
      },
    );

  const targets = useMemo(() => data?.data ?? [], [data]);
  const total = data?.total ?? 0;
  const selected = useMemo(
    () => targets.filter((_, index) => rowSelection[String(index)]),
    [targets, rowSelection],
  );

  if (!data && !isLoading)
    return (
      <DataTableError message="Failed to load targets." onRetry={refetch} />
    );

  const handleRowClick = (target: GetManyTargetResponseDto) => {
    navigate({
      to: '/targets/$id/$tab',
      params: { id: target.id, tab: 'overview' },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <TargetsSummary view={view} onViewChange={handleViewChange} />
      <DataTable
        data={targets}
        columns={targetColumns}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={(next) => {
          setRowSelection({});
          setPage(next);
        }}
        onPageSizeChange={setPageSize}
        onSortChange={(col, order) => {
          setParams({ sortBy: col, sortOrder: order });
        }}
        filterColumnKey="value"
        filterValue={filter}
        onFilterChange={setFilter}
        filterComponents={[
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
        ]}
        toolbarComponents={[<StartDiscoveryButton key="start-discovery" />]}
        totalItems={total}
        onRowClick={handleRowClick}
        rowClassName="cursor-pointer hover:bg-muted/50 transition-colors"
        showCheckBox
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectionHeader={() => (
          <TargetBulkActions
            targets={selected}
            onDone={() => setRowSelection({})}
          />
        )}
      />
    </div>
  );
}
