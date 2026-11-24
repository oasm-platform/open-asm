import Page from '@/components/common/page';
import { useT } from '@/lib/i18n-dictionary';
import { ListInternalNetworks } from './list-internal-networks';

export default function InternalNetworks() {
  const t = useT();
  return (
    <Page title={t('internalNetworks.page.title')} permission="network.read">
      <ListInternalNetworks />
    </Page>
  );
}
