import { DataTable } from '@/components/ui/data-table';
import JobStatusBadge from '@/components/ui/job-status';
import {
  JobRunType,
  VulnerabilityProvenance,
  useProjectsControllerGetRuns,
  type ProjectRunDto,
  type ProjectWorkflow,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { ProjectDetailSearch } from '@/routes/_authed/projects/$id/$tab';
import dayjs from 'dayjs';
import { CalendarDays, Clock } from 'lucide-react';
import { useState } from 'react';
import { FilterSelect } from '../components/filter-select';
import { assetCount, runTriggerLabel, workflowLabel } from '../project-utils';

const PAGE_SIZE = 20;

/** "4m 14s", as on the jobs registry's run page. */
function formatDuration(run: ProjectRunDto): string {
  if (!run.isCompleted) return 'Running';
  const total = Math.max(0, dayjs(run.updatedAt).diff(dayjs(run.createdAt), 'second'));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${total % 60}s`);
  return parts.join(' ');
}

export function RunsTab({
  projectId,
  workflows,
}: {
  projectId: string;
  workflows: ProjectWorkflow[];
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as ProjectDetailSearch;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [runType, setRunType] = useState<JobRunType | 'all'>('all');

  const { data, isLoading } = useProjectsControllerGetRuns(
    projectId,
    {
      page,
      limit: pageSize,
      ...(search.workflow ? { projectWorkflowId: search.workflow } : {}),
      ...(runType !== 'all' ? { jobRunType: runType } : {}),
    },
    { query: { refetchInterval: 15_000 } },
  );

  const columns: ColumnDef<ProjectRunDto>[] = [
    {
      accessorKey: 'workflowName',
      header: 'Run',
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <JobStatusBadge status={row.original.status} />
          <span className="font-medium">
            {workflowLabel({ name: row.original.workflowName })}
          </span>
          <span className="text-muted-foreground">#{row.original.id.slice(0, 6)}</span>
        </span>
      ),
    },
    {
      id: 'trigger',
      header: 'Triggered by',
      cell: ({ row }) => runTriggerLabel(row.original.jobRunType),
    },
    {
      accessorKey: 'scopeSize',
      header: 'Scope',
      cell: ({ row }) => (
        <span className="tabular-nums">{assetCount(row.original.scopeSize)}</span>
      ),
    },
    {
      id: 'steps',
      header: 'Steps',
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.stepsDone}/{row.original.stepsTotal}
          {row.original.stepsFailed > 0 && (
            <span className="text-destructive"> · {row.original.stepsFailed} failed</span>
          )}
        </span>
      ),
    },
    {
      id: 'found',
      header: 'Found',
      cell: ({ row }) =>
        row.original.newVulnerabilities + row.original.recurringVulnerabilities ===
        0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex gap-2">
            {row.original.newVulnerabilities > 0 && (
              <Link
                to="/projects/$id/$tab"
                params={{ id: projectId, tab: 'vulnerabilities' }}
                search={{ run: row.original.id, provenance: VulnerabilityProvenance.new }}
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                +{row.original.newVulnerabilities} new
              </Link>
            )}
            {row.original.recurringVulnerabilities > 0 && (
              <span className="text-muted-foreground">
                {row.original.recurringVulnerabilities} recurring
              </span>
            )}
          </span>
        ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Started',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
          <CalendarDays className="size-4" />
          {dayjs(row.original.createdAt).format('YYYY-MM-DD HH:mm:ss')}
        </span>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
          <Clock className="size-4" />
          {formatDuration(row.original)}
        </span>
      ),
    },
  ];

  const filters = [
    <FilterSelect
      key="trigger"
      label="Triggered by"
      value={runType}
      onValueChange={(value) => {
        setRunType(value as JobRunType | 'all');
        setPage(1);
      }}
      options={[
        { value: 'all', label: 'All triggers' },
        { value: JobRunType.manual, label: 'Manual', dot: 'bg-blue-500' },
        { value: JobRunType.scheduled, label: 'Schedule', dot: 'bg-purple-500' },
        { value: JobRunType.event, label: 'Assets added', dot: 'bg-orange-500' },
      ]}
    />,
  ];
  if (workflows.length > 1) {
    filters.unshift(
      <FilterSelect
        key="workflow"
        label="Workflow"
        value={search.workflow ?? 'all'}
        onValueChange={(value) => {
          setPage(1);
          void navigate({
            to: '/projects/$id/$tab',
            params: { id: projectId, tab: 'runs' },
            search: { ...search, workflow: value === 'all' ? undefined : value },
            replace: true,
          });
        }}
        options={[
          { value: 'all', label: 'All workflows' },
          ...workflows.map((binding) => ({
            value: binding.id,
            label: workflowLabel(binding.workflow),
            dot: 'bg-blue-500',
          })),
        ]}
      />,
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data?.data ?? []}
      isLoading={isLoading}
      page={page}
      pageSize={pageSize}
      totalItems={data?.total ?? 0}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
      }}
      filterComponents={filters}
      onRowClick={(row) => navigate({ to: '/jobs/runs/$id', params: { id: row.id } })}
      emptyMessage="No runs yet"
    />
  );
}
