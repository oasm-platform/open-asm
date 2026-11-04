import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { SeverityBadge } from '@/components/ui/severity-badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  TimelineSighting,
  VulnerabilityProvenance,
  VulnerabilityStatus,
  useProjectsControllerGetVulnerabilities,
  useProjectsControllerGetVulnerabilityTimeline,
  type ProjectVulnerabilityDto,
  type ProjectWorkflow,
  type Severity,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { ProjectDetailSearch } from '@/routes/_authed/projects/$id/$tab';
import dayjs from 'dayjs';
import { ExternalLink, Info, X } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { FilterSelect } from '../components/filter-select';
import { SEVERITIES, workflowLabel } from '../project-utils';

const PAGE_SIZE = 20;

/** New / recurring ×n / not seen again. */
export const ProvenanceBadge = memo(function ProvenanceBadge({
  provenance,
  timesSeen,
}: {
  provenance: VulnerabilityProvenance;
  timesSeen: number;
}) {
  if (provenance === VulnerabilityProvenance.new) {
    return <Badge variant="soft">New</Badge>;
  }
  if (provenance === VulnerabilityProvenance.not_seen) {
    return (
      <Badge
        variant="outline"
        className="border-dashed"
        title="A later scan of this asset with the same tool did not report it: possibly fixed"
      >
        Not seen again
      </Badge>
    );
  }
  return <Badge variant="secondary">Recurring ×{timesSeen}</Badge>;
});

const shortRun = (id?: string | null) => (id ? `#${id.slice(0, 6)}` : '—');

/** Date of a sighting, with the run that made it. */
function Sighting({ runId, at }: { runId?: string | null; at: string }) {
  return (
    <span className="flex flex-col tabular-nums">
      <span title={dayjs(at).format('YYYY-MM-DD HH:mm')}>
        {new Date(at).toLocaleDateString()}
      </span>
      {runId ? (
        <Link
          to="/jobs/runs/$id"
          params={{ id: runId }}
          className="text-xs text-muted-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Run {shortRun(runId)}
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">Run deleted</span>
      )}
    </span>
  );
}

/** Runs that saw (or missed) one vulnerability. */
export function TimelineSheet({
  projectId,
  vulnerabilityId,
  onClose,
}: {
  projectId: string;
  vulnerabilityId?: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useProjectsControllerGetVulnerabilityTimeline(
    projectId,
    vulnerabilityId ?? '',
    { query: { enabled: !!vulnerabilityId } },
  );
  const vuln = data?.vulnerability;
  const missed = data?.runs.filter((run) => run.sighting === TimelineSighting.missed).length ?? 0;

  return (
    <Sheet open={!!vulnerabilityId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-6">{vuln?.name ?? 'Vulnerability'}</SheetTitle>
          <SheetDescription>{vuln?.assetValue}</SheetDescription>
        </SheetHeader>
        {isLoading || !data || !vuln ? (
          <p className="px-4 text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={vuln.severity} />
              <ProvenanceBadge provenance={vuln.provenance} timesSeen={vuln.timesSeen} />
              {vuln.toolName && <Badge variant="outline">{vuln.toolName}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              Seen in {vuln.timesSeen} run{vuln.timesSeen === 1 ? '' : 's'} of
              this project
              {missed > 0
                ? `; the last ${missed} scan${missed === 1 ? '' : 's'} of this asset with ${vuln.toolName ?? 'the same tool'} did not report it, so it may be fixed.`
                : '.'}
            </p>
            <ol className="flex flex-col gap-0 border-l pl-4">
              {data.runs.map((run) => (
                <li key={run.id} className="relative py-2">
                  <span
                    className={cn(
                      'absolute -left-[21px] top-3 size-2.5 rounded-full border-2',
                      run.sighting === TimelineSighting.seen && 'border-primary bg-primary',
                      run.sighting === TimelineSighting.missed && 'border-dashed border-muted-foreground bg-background',
                      run.sighting === TimelineSighting.unknown && 'border-muted-foreground bg-muted',
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      to="/jobs/runs/$id"
                      params={{ id: run.id }}
                      className="font-medium hover:underline"
                    >
                      {shortRun(run.id)}
                    </Link>
                    <span className="text-muted-foreground">
                      {workflowLabel({ name: run.workflowName })}
                    </span>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {dayjs(run.createdAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {run.sighting === TimelineSighting.seen
                      ? 'Reported'
                      : run.sighting === TimelineSighting.missed
                        ? 'Scanned, not reported'
                        : 'Scanned; sighting not recorded'}
                  </p>
                </li>
              ))}
            </ol>
            <Button variant="outline" asChild>
              <Link to="/vulnerabilities/$id" params={{ id: vuln.id }}>
                <ExternalLink className="size-4" />
                Open vulnerability
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function VulnerabilitiesTab({
  projectId,
  workflows,
}: {
  projectId: string;
  workflows: ProjectWorkflow[];
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as ProjectDetailSearch;
  const provenance = (search.provenance as VulnerabilityProvenance | undefined) ?? undefined;
  const severity = useMemo(
    () => (search.severity ? (search.severity.split(',') as Severity[]) : []),
    [search.severity],
  );
  const [status, setStatus] = useState<VulnerabilityStatus>(VulnerabilityStatus.open);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [text, setText] = useState('');
  const onSearch = useCallback((value: string) => {
    setText(value);
    setPage(1);
  }, []);

  const setSearch = (patch: Partial<typeof search>) => {
    setPage(1);
    void navigate({
      to: '/projects/$id/$tab',
      params: { id: projectId, tab: 'vulnerabilities' },
      search: { ...search, ...patch },
      replace: true,
    });
  };

  const { data, isLoading } = useProjectsControllerGetVulnerabilities(projectId, {
    page,
    limit: pageSize,
    search: text,
    status,
    ...(provenance ? { provenance } : {}),
    ...(severity.length ? { severity } : {}),
    ...(search.workflow ? { projectWorkflowId: search.workflow } : {}),
    ...(search.run ? { jobHistoryId: search.run } : {}),
  });

  const counts = data?.provenanceCounts;
  const segments: Array<{ value: string; label: string; count?: number }> = [
    { value: 'all', label: 'All', count: counts?.all },
    { value: VulnerabilityProvenance.new, label: 'New', count: counts?.new },
    { value: VulnerabilityProvenance.recurring, label: 'Recurring', count: counts?.recurring },
    { value: VulnerabilityProvenance.not_seen, label: 'Not seen again', count: counts?.notSeen },
  ];

  const toggleSeverity = (key: Severity) => {
    const next = severity.includes(key)
      ? severity.filter((s) => s !== key)
      : [...severity, key];
    setSearch({ severity: next.length ? next.join(',') : undefined });
  };

  const columns: ColumnDef<ProjectVulnerabilityDto>[] = [
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
    },
    {
      accessorKey: 'name',
      header: 'Details',
      cell: ({ row }) => (
        <div className="flex max-w-md items-center gap-2">
          <span className="truncate font-medium">{row.original.name}</span>
          {row.original.cveId?.length ? (
            <Badge variant="outline" className="shrink-0">
              {row.original.cveId[0]}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'assetValue',
      header: 'Asset',
    },
    {
      accessorKey: 'provenance',
      header: 'Provenance',
      cell: ({ row }) => (
        <ProvenanceBadge
          provenance={row.original.provenance}
          timesSeen={row.original.timesSeen}
        />
      ),
    },
    {
      id: 'firstSeen',
      header: 'First seen',
      cell: ({ row }) => <Sighting {...row.original.firstSeen} />,
    },
    {
      id: 'lastSeen',
      header: 'Last seen',
      cell: ({ row }) => <Sighting {...row.original.lastSeen} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.status}
        </Badge>
      ),
    },
  ];

  const filters = [
    <FilterSelect
      key="status"
      label="Status"
      value={status}
      onValueChange={(value) => {
        setStatus(value as VulnerabilityStatus);
        setPage(1);
      }}
      options={[
        { value: VulnerabilityStatus.open, label: 'Open', dot: 'bg-red-500' },
        { value: VulnerabilityStatus.dismissed, label: 'Dismissed', dot: 'bg-green-500' },
        { value: VulnerabilityStatus.all, label: 'All statuses' },
      ]}
    />,
  ];
  if (workflows.length > 1) {
    filters.push(
      <FilterSelect
        key="workflow"
        label="Workflow"
        value={search.workflow ?? 'all'}
        onValueChange={(value) =>
          setSearch({ workflow: value === 'all' ? undefined : value })
        }
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
  if (search.run) {
    filters.push(
      <Button
        key="run"
        variant="outline"
        className="border-dashed text-xs"
        aria-label="Clear the run filter"
        onClick={() => setSearch({ run: undefined })}
      >
        Run {shortRun(search.run)}
        <X className="size-3.5" />
      </Button>,
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Same figures as the vulnerabilities page; each one filters the list. */}
      <div
        className="flex flex-wrap items-center gap-x-12 gap-y-3"
        role="group"
        aria-label="Severity"
      >
        {SEVERITIES.map((s) => {
          const on = severity.includes(s.key as Severity);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleSeverity(s.key as Severity)}
              className={cn(
                'flex flex-col items-start rounded-md text-left transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                severity.length > 0 && !on && 'opacity-40 hover:opacity-70',
              )}
            >
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span className={cn('text-2xl font-bold', s.text)}>
                {data?.severityCounts?.[s.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <Tabs
        value={provenance ?? 'all'}
        onValueChange={(value) =>
          setSearch({
            provenance: value === 'all' ? undefined : (value as VulnerabilityProvenance),
          })
        }
      >
        <div className="flex items-center gap-2">
          <TabsList
            aria-label="Provenance"
            className="flex w-max flex-nowrap rounded-none bg-transparent p-0"
          >
            {segments.map((segment) => (
              <TabsTrigger
                key={segment.value}
                value={segment.value}
                className="h-9 flex-none hover:cursor-pointer"
                badge={segment.count ?? '–'}
              >
                {segment.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About provenance"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                “Not seen again” compares each finding with the last scan of its
                asset by the same tool, so a run on a few new assets does not mark
                the rest as fixed. Dismissing a vulnerability applies to the whole
                workspace.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </Tabs>

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
        filterColumnKey="name"
        filterValue={text}
        onFilterChange={onSearch}
        filterPlaceholder="Search name, asset or CVE"
        filterComponents={filters}
        onRowClick={(row) => setSearch({ vulnerability: row.id })}
        emptyMessage="No vulnerabilities match these filters"
      />

      <TimelineSheet
        projectId={projectId}
        vulnerabilityId={search.vulnerability}
        onClose={() => setSearch({ vulnerability: undefined })}
      />
    </div>
  );
}
