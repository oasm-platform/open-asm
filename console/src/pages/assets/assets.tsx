import Page from '@/components/common/page';
import { AssetGroupTab } from '@/pages/asset-group/asset-group-tab';
import AssetProvider from './context/asset-context';

const Assets = () => {
  return (
    <Page title="Assets">
      <AssetProvider>
        <AssetGroupTab />
      </AssetProvider>
    </Page>
  );
};

export default Assets;
