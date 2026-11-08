import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SeverityBadge } from '@/components/ui/severity-badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  TimelineSighting,
  useProjectsControllerGetVulnerabilityTimeline,
} from '@/services/apis/gen/queries';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { ProjectDetailSearch } from '@/routes/_authed/projects/$id/$tab';
import dayjs from 'dayjs';
import { ExternalLink } from 'lucide-react';
import { ProvenanceBadge } from '../../vulnerabilities/components/provenance-badge';
import { VulnerabilitiesView } from '../../vulnerabilities/vulnerabilities-view';
import { workflowLabel } from '../project-utils';

const shortRun = (id?: string | null) => (id ? `#${id.slice(0, 6)}` : '—');

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

/**
 * The project's vulnerabilities: the same cards and list as the
 * Vulnerabilities page, scoped to the project, with each finding's
 * provenance; its badge opens the runs that saw it.
 */
export function VulnerabilitiesTab({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as ProjectDetailSearch;
  const setVulnerability = (vulnerability?: string) =>
    void navigate({
      to: '/projects/$id/$tab',
      params: { id: projectId, tab: 'vulnerabilities' },
      search: { ...search, vulnerability },
      replace: true,
    });

  return (
    <>
      <VulnerabilitiesView projectId={projectId} onOpenSighting={setVulnerability} />
      <TimelineSheet
        projectId={projectId}
        vulnerabilityId={search.vulnerability}
        onClose={() => setVulnerability(undefined)}
      />
    </>
  );
}
