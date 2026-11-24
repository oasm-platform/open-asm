import Page from '@/components/common/page';
import { useT } from '@/lib/i18n-dictionary';
import AssetProvider from './context/asset-context';
import { ListAssets } from './list-assets';

const Assets = () => {
  const t = useT();
  return (
    <Page
      title={t('assets.page.title')}
      description={t('assets.page.description')}
      permission="asset.read"
    >
      <AssetProvider>
        <ListAssets />
      </AssetProvider>
    </Page>
  );
};

export default Assets;
