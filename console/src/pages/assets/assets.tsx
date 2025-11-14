import Page from '@/components/common/page';
import AssetProvider from './context/asset-context';
import { ListAssets } from './list-assets';

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
