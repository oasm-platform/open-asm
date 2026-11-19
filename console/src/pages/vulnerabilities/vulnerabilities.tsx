import Page from '@/components/common/page';
import { usePermission } from '@/hooks/usePermission';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useSearch } from '@tanstack/react-router';
import { SeverityBreakdown } from '../projects/components/severity-bar';
import CreateWorkspace from '../workspaces/create-workspace';
import { FastScanDialog } from './components/fast-scan-dialog';
import { openSeverityCounts } from './components/stats-strip';
import { useVulnerabilityStats } from './use-vulnerability-stats';
import { VulnerabilitiesView } from './vulnerabilities-view';

/**
 * Open findings per severity beside the page title, instead of inside the
 * Open card where they made the whole card row taller. Same request as the
 * cards (same target filter), so it adds no fetch.
 */
function OpenSeverityBreakdown() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const targetId =
    typeof search.targetId === 'string' ? search.targetId : undefined;
  const { data: stats } = useVulnerabilityStats(targetId);

  if (!stats) return null;
  return (
    <SeverityBreakdown
      counts={openSeverityCounts(stats)}
      showLabels
      className="gap-x-4"
    />
  );
}

const Vulnerabilities = () => {
  const { workspaces } = useWorkspaceSelector();
  const { hasPermission } = usePermission();
  const hasWorkspace = workspaces.length > 0;
  return (
    <Page
      title="Vulnerabilities"
      description="Security findings from scans and AI agents across your assets"
      permission="vulnerability.read"
      header={
        hasWorkspace ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* The header shows even without access: no stats fetch then */}
            {hasPermission('vulnerability.read') && <OpenSeverityBreakdown />}
            <FastScanDialog />
          </div>
        ) : undefined
      }
    >
      {!hasWorkspace ? (
        <CreateWorkspace />
      ) : (
        <VulnerabilitiesView showSeverityBreakdown={false} />
      )}
    </Page>
  );
};

export default Vulnerabilities;
