import Page from '@/components/common/page';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import CreateWorkspace from '../workspaces/create-workspace';
import { FastScanDialog } from './components/fast-scan-dialog';
import { ListVulnerabilities } from './list-vulnerabilitys';
import VulnerabilitiesStatistic from './vulnerabilites-statistic';

const Vulnerabilities = () => {
  const { workspaces } = useWorkspaceSelector();
  return (
    <Page
      title="Vulnerabilities"
      description="Security findings from scans across your assets"
      permission="vulnerability.read"
    >
      {workspaces.length === 0 ? (
        <CreateWorkspace />
      ) : (
        <div className="flex flex-col gap-5">
          <VulnerabilitiesStatistic />
          <ListVulnerabilities actions={<FastScanDialog />} />
        </div>
      )}
    </Page>
  );
};

export default Vulnerabilities;
