import Page from '@/components/common/page';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import CreateWorkspace from '../workspaces/create-workspace';
import { ListVulnerabilities } from './list-vulnerabilitys';
import VulnerabilitiesStatistic from './vulnerabilites-statistic';

const Vulnerabilities = () => {
    const { workspaces } = useWorkspaceSelector();
    return (
        <Page title='Vulnerabilities'>
            {workspaces.length === 0 ? <CreateWorkspace /> : (
                <div className='flex flex-col gap-5'>
                    <VulnerabilitiesStatistic />
                    <ListVulnerabilities />
                </div>
            )}
        </Page>
    );
};

export default Vulnerabilities;