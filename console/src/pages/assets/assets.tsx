import Page from '@/components/common/page';
import { ListAssets } from './list-assets';
import AssetProvider from './context/asset-context';

const Assets = () => {
  return (
    <Page title="Assets">
      <AssetProvider>
        <ListAssets />
      </AssetProvider>
    </Page>
  );
};

export default Assets;
