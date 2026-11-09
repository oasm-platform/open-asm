import { useNavigate, useSearch } from '@tanstack/react-router';
import { format, subDays } from 'date-fns';
import type { ReactNode } from 'react';
import {
  VulnerabilityStatsStrip,
  type StatsView,
} from './components/stats-strip';
import { ListVulnerabilities } from './list-vulnerabilitys';
import { useVulnerabilityStats } from './use-vulnerability-stats';

/** Search of the list view a stat card counts; filters it does not use are cleared. */
function statsViewSearch(view: StatsView): Record<string, unknown> {
  const today = new Date();
  return {
    status: undefined,
    overdue: view === 'overdue' ? true : undefined,
    createdFrom:
      view === 'new' ? format(subDays(today, 7), 'yyyy-MM-dd') : undefined,
    createdTo: view === 'new' ? format(today, 'yyyy-MM-dd') : undefined,
    page: 1,
  };
}

/**
 * The lifecycle cards and the vulnerability list under them: the
 * Vulnerabilities page, and the Vulnerabilities tab of a target (scoped by
 * `targetId`) or a project (`projectId`, with provenance).
 */
export function VulnerabilitiesView({
  targetId,
  projectId,
  onOpenSighting,
  actions,
}: {
  targetId?: string;
  projectId?: string;
  /** In a project: opens the runs that saw a finding. */
  onOpenSighting?: (vulnerabilityId: string) => void;
  /** Toolbar actions of the list. */
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const effectiveTargetId =
    targetId ??
    (typeof search.targetId === 'string' ? search.targetId : undefined);
  const { data: stats, isLoading } = useVulnerabilityStats(
    effectiveTargetId,
    projectId,
  );

  return (
    <div className="flex flex-col gap-4">
      <VulnerabilityStatsStrip
        stats={stats}
        isLoading={isLoading}
        onSelect={(view) =>
          navigate({
            search: ((prev: Record<string, unknown>) => ({
              ...prev,
              ...statsViewSearch(view),
            })) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            replace: true,
          })
        }
      />
      <ListVulnerabilities
        targetId={targetId}
        projectId={projectId}
        onOpenSighting={onOpenSighting}
        actions={actions}
      />
    </div>
  );
}
