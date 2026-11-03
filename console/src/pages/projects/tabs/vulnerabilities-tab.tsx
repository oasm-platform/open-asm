import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SeverityBadge } from '@/components/ui/severity-badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import useDebounce from '@/hooks/use-debounce';
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
import { ExternalLink, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
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

function Sighting({ runId, at }: { runId?: string | null; at: string }) {
  return (
    <span className="flex flex-col text-xs tabular-nums">
      {runId ? (
        <Link
          to="/jobs/runs/$id"
          params={{ id: runId }}
          className="font-mono hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {shortRun(runId)}
        </Link>
      ) : (
        <span className="text-muted-foreground">run deleted</span>
      )}
      <span className="text-muted-foreground" title={dayjs(at).format('DD MMM YYYY, HH:mm')}>
        {dayjs(at).format('DD MMM')}
      </span>
    </span>
  );
}

/** Runs that saw (or missed) one vulnerability. */
function TimelineSheet({
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
          <SheetDescription className="font-mono">{vuln?.assetValue}</SheetDescription>
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
                      className="font-mono hover:underline"
                    >
                      {shortRun(run.id)}
                    </Link>
                    <span className="text-muted-foreground">
                      {workflowLabel({ name: run.workflowName })}
                    </span>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {dayjs(run.createdAt).format('DD MMM YYYY, HH:mm')}
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
  const [text, setText] = useState('');
  const debounced = useDebounce(text, 400);

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
    limit: PAGE_SIZE,
    search: debounced,
    status,
    ...(provenance ? { provenance } : {}),
    ...(severity.length ? { severity } : {}),
    ...(search.workflow ? { projectWorkflowId: search.workflow } : {}),
    ...(search.run ? { jobHistoryId: search.run } : {}),
  });

  const counts = data?.provenanceCounts;
  const segments: Array<{ value?: VulnerabilityProvenance; label: string; count?: number }> = [
    { label: 'All', count: counts?.all },
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
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex max-w-md flex-col">
          <span className="truncate">{row.original.name}</span>
          {row.original.cveId?.length ? (
            <span className="truncate text-xs text-muted-foreground">
              {row.original.cveId.join(', ')}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'assetValue',
      header: 'Asset',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.assetValue}</span>
      ),
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Provenance">
        {segments.map((segment) => (
          <Button
            key={segment.label}
            size="sm"
            variant={provenance === segment.value ? 'default' : 'outline'}
            aria-pressed={provenance === segment.value}
            onClick={() => setSearch({ provenance: segment.value })}
          >
            {segment.label}
            <span className="tabular-nums opacity-70">{segment.count ?? '–'}</span>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, asset or CVE..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPage(1);
          }}
          className="h-8 w-full text-xs md:w-64"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Severity">
          {SEVERITIES.map((s) => {
            const on = severity.includes(s.key as Severity);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSeverity(s.key as Severity)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs',
                  on ? 'border-primary bg-primary/10' : 'hover:bg-accent',
                )}
              >
                <span className={cn('size-2 rounded-full', s.bar)} />
                {s.label}
                <span className="tabular-nums text-muted-foreground">
                  {data?.severityCounts?.[s.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as VulnerabilityStatus);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Status" className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={VulnerabilityStatus.open}>Open</SelectItem>
            <SelectItem value={VulnerabilityStatus.dismissed}>Dismissed</SelectItem>
            <SelectItem value={VulnerabilityStatus.all}>All</SelectItem>
          </SelectContent>
        </Select>
        {workflows.length > 1 && (
          <Select
            value={search.workflow ?? 'all'}
            onValueChange={(value) =>
              setSearch({ workflow: value === 'all' ? undefined : value })
            }
          >
            <SelectTrigger aria-label="Workflow" className="h-8 w-[170px] text-xs">
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
        {search.run && (
          <Badge variant="outline" className="h-8 gap-1">
            Run {shortRun(search.run)}
            <button
              type="button"
              aria-label="Clear the run filter"
              onClick={() => setSearch({ run: undefined })}
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        “Not seen again” compares each finding with the last scan of its asset by
        the same tool, so a run on a few new assets does not mark the rest as
        fixed. Dismissing a vulnerability applies to the whole workspace.
      </p>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        pageSize={PAGE_SIZE}
        totalItems={data?.total ?? 0}
        onPageChange={setPage}
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
