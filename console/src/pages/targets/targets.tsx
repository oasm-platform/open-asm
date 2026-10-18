import Page from '@/components/common/page';
import { ListTargets } from './list-targets';

const Targets = () => {
  return (
    <Page
      title="Targets"
      description="Domains, IP ranges and repositories in your scanning scope"
      permission="target.read"
    >
      <ListTargets />
    </Page>
  );
};

export default Targets;
