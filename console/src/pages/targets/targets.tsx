import { useT } from '@/lib/i18n-dictionary';
import Page from '@/components/common/page';
import { ListTargets } from './list-targets';

const Targets = () => {
  const t = useT();
  return (
    <Page
      title={t('targets.page.title')}
      description={t('targets.page.description')}
      permission="target.read"
    >
      <ListTargets />
    </Page>
  );
};

export default Targets;
