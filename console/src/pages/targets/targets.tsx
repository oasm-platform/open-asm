import Page from '@/components/common/page';
import { ListTargets } from './list-targets';

const Targets = () => {
  return (
    <Page title="Targets" permission="target.read">
      <ListTargets />
    </Page>
  );
};

export default Targets;
