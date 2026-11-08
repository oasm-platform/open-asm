import Page from '@/components/common/page';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import CreateWorkspace from '../workspaces/create-workspace';
import { FastScanDialog } from './components/fast-scan-dialog';
import { VulnerabilitiesView } from './vulnerabilities-view';

const Vulnerabilities = () => {
  const { workspaces } = useWorkspaceSelector();
  const hasWorkspace = workspaces.length > 0;
  return (
    <Page
      title="Vulnerabilities"
      description="Security findings from scans and AI agents across your assets"
      permission="vulnerability.read"
      header={hasWorkspace ? <FastScanDialog /> : undefined}
    >
      {!hasWorkspace ? <CreateWorkspace /> : <VulnerabilitiesView />}
    </Page>
  );
};

export default Vulnerabilities;
