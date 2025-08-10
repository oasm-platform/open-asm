import Page from '@/components/common/page';
import { ListVulnerabilities } from './list-vulnerabilitys';
import VulnerabilitiesStatistic from './vulnerabilites-statistic';

const Vulnerabilities = () => {
    return (
        <Page title='Vulnerabilities' isShowButtonGoBack>
            <VulnerabilitiesStatistic />
            <ListVulnerabilities />
        </Page>
    );
};

export default Vulnerabilities;