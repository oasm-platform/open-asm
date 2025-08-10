import Page from '@/components/common/page';
import { ListVulnerabilities } from './list-vulnerabilitys';

const Vulnerabilities = () => {
    return (
        <Page title='Vulnerabilities' isShowButtonGoBack>
            <ListVulnerabilities />
        </Page>
    );
};

export default Vulnerabilities;