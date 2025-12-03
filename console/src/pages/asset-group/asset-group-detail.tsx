import Page from '@/components/common/page';
import { useAssetGroupControllerGetById } from '@/services/apis/gen/queries';
import { useParams } from 'react-router-dom';
import AssetGroupWorkflow from './components/asset-group-workflow';
import { AssetSection } from './components/asset-section';

export default function AssetGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { data } = useAssetGroupControllerGetById(id!);

  if (!data) return <div>Loading...</div>;

  return (
    <Page title={data.name} isShowButtonGoBack>
      <AssetGroupWorkflow assetGroupId={id!} />
      <AssetSection assetGroupId={id!} />
    </Page>
  );
}
