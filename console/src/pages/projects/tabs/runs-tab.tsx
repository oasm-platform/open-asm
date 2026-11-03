import { DataTable } from '@/components/ui/data-table';
import JobStatusBadge from '@/components/ui/job-status';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import { assetCount, runTriggerLabel, workflowLabel } from '../project-utils';

dayjs.extend(relativeTime);
dayjs.extend(duration);

const PAGE_SIZE = 20;

function formatDuration(run: ProjectRunDto): string {
  if (!run.isCompleted) return 'running';
  const ms = dayjs(run.updatedAt).diff(dayjs(run.createdAt));
  const d = dayjs.duration(Math.max(0, ms));
  if (d.asHours() >= 1) return `${Math.floor(d.asHours())} h ${d.minutes()} min`;
  if (d.asMinutes() >= 1) return `${Math.floor(d.asMinutes())} min`;
  return `${d.seconds()} s`;
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
  const [runType, setRunType] = useState<JobRunType | 'all'>('all');

  const { data, isLoading } = useProjectsControllerGetRuns(
    projectId,
    {
      page,
      limit: PAGE_SIZE,
      ...(search.workflow ? { projectWorkflowId: search.workflow } : {}),
      ...(runType !== 'all' ? { jobRunType: runType } : {}),
    },
    { query: { refetchInterval: 15_000 } },
  );

  const columns: ColumnDef<ProjectRunDto>[] = [
    {
      id: 'run',
      header: 'Run',
      cell: ({ row }) => (
        <span className="font-mono text-xs">#{row.original.id.slice(0, 6)}</span>
      ),
    },
    {
      accessorKey: 'workflowName',
      header: 'Workflow',
      cell: ({ row }) => workflowLabel({ name: row.original.workflowName }),
    },
    {
      id: 'trigger',
      header: 'Triggered by',
      cell: ({ row }) => (
        <span className="text-xs">
          {runTriggerLabel(row.original.jobRunType)}
        </span>
      ),
    },
    {
      accessorKey: 'scopeSize',
      header: 'Scope',
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">{assetCount(row.original.scopeSize)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
    },
    {
      id: 'steps',
      header: 'Steps',
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">
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
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="flex gap-1.5 text-xs">
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
        <span
          className="text-xs text-muted-foreground"
          title={dayjs(row.original.createdAt).format('DD MMM YYYY, HH:mm')}
        >
          {dayjs(row.original.createdAt).fromNow()}
        </span>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatDuration(row.original)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {workflows.length > 1 && (
          <Select
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
          >
            <SelectTrigger aria-label="Workflow" className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workflows</SelectItem>
              {workflows.map((binding) => (
                <SelectItem key={binding.id} value={binding.id}>
                  {workflowLabel(binding.workflow)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={runType}
          onValueChange={(value) => {
            setRunType(value as JobRunType | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Triggered by" className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any trigger</SelectItem>
            <SelectItem value={JobRunType.manual}>Manual</SelectItem>
            <SelectItem value={JobRunType.scheduled}>Schedule</SelectItem>
            <SelectItem value={JobRunType.event}>Assets added</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        pageSize={PAGE_SIZE}
        totalItems={data?.total ?? 0}
        onPageChange={setPage}
        onRowClick={(row) =>
          navigate({ to: '/jobs/runs/$id', params: { id: row.id } })
        }
        emptyMessage="No runs yet"
      />
    </div>
  );
}
