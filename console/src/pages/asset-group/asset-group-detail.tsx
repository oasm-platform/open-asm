import Page from '@/components/common/page';
import { useAssetGroupControllerGetById } from '@/services/apis/gen/queries';
import { useParams } from 'react-router-dom';
import AssetGroupWorkflow from './components/asset-group-workflow';
import { AssetSection } from './components/asset-section';
import { EditAssetGroupDialog } from './components/edit-asset-group-dialog';

export default function AssetGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useAssetGroupControllerGetById(id!);

  if (!data) return <div></div>;

  return (
    <Page
      isShowButtonGoBack
      header={
        <div className="flex items-center gap-2">
          <div
            className={`h-5 w-5 rounded-full`}
            style={{ background: data?.hexColor }}
          ></div>
          {data?.name}
          <EditAssetGroupDialog assetGroup={data} onSuccess={refetch} />
        </div>
      }
    >
      <AssetGroupWorkflow assetGroupId={id!} />
      <AssetSection assetGroupId={id!} />
    </Page>
  );
}
