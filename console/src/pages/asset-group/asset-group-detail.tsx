import { useParams } from 'react-router-dom';
import { useAssetGroupControllerGetById } from '@/services/apis/gen/queries';
import { AssetSection } from './components/asset-section';
import { ToolSection } from './components/tool-section';

export default function AssetGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useAssetGroupControllerGetById(id!);

  if (!data) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{data.name}</h1>
        <p className="text-muted-foreground">
          Asset Group ID: {data.id} | Created:{' '}
          {new Date(data.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AssetSection assetGroupId={id!} refetch={refetch} />
        <ToolSection assetGroupId={id!} refetch={refetch} />
      </div>
    </div>
  );
}
