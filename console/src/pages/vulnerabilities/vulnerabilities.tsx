import Page from '@/components/common/page';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useSearch } from '@tanstack/react-router';
import CreateWorkspace from '../workspaces/create-workspace';
import { FastScanDialog } from './components/fast-scan-dialog';
import { VulnerabilityStatsStrip } from './components/stats-strip';
import { ListVulnerabilities } from './list-vulnerabilitys';
import { useVulnerabilityStats } from './use-vulnerability-stats';

const Vulnerabilities = () => {
  const { workspaces } = useWorkspaceSelector();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const targetId =
    typeof search.targetId === 'string' ? search.targetId : undefined;
  const { data: stats, isLoading } = useVulnerabilityStats(targetId);
  return (
    <Page
      title="Vulnerabilities"
      description="Security findings from scans and AI agents across your assets"
      permission="vulnerability.read"
    >
      {workspaces.length === 0 ? (
        <CreateWorkspace />
      ) : (
        <div className="flex flex-col gap-5">
          <VulnerabilityStatsStrip stats={stats} isLoading={isLoading} />
          <ListVulnerabilities actions={<FastScanDialog />} />
        </div>
      )}
    </Page>
  );
};

export default Vulnerabilities;
