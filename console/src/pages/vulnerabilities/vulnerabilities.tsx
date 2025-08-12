import Page from '@/components/common/page';
import { ListVulnerabilities } from './list-vulnerabilitys';
import VulnerabilitiesStatistic from './vulnerabilites-statistic';

const Vulnerabilities = () => {
    return (
        <Page title='Vulnerabilities' className='flex flex-col gap-5'>
            <VulnerabilitiesStatistic />
            <ListVulnerabilities />
        </Page>
    );
};

export default Vulnerabilities;