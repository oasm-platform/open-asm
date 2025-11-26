import Page from '@/components/common/page';
import { useAssetGroupControllerGetById } from '@/services/apis/gen/queries';
import { useParams } from 'react-router-dom';
import { AssetSection } from './components/asset-section';

export default function AssetGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { data } = useAssetGroupControllerGetById(id!);

  if (!data) return <div>Loading...</div>;

  return (
    <Page title={data.name} isShowButtonGoBack>
      <AssetSection assetGroupId={id!} />
    </Page>
  );
}
