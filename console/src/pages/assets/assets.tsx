import Page from '@/components/common/page';
import AssetProvider from './context/asset-context';
import { ListAssets } from './list-assets';

const Assets = () => {
  return (
    <Page
      title="Assets"
      description="Services, hosts and other assets discovered from your targets"
      permission="asset.read"
    >
      <AssetProvider>
        <ListAssets />
      </AssetProvider>
    </Page>
  );
};

export default Assets;
