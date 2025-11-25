import { useAssetGroupControllerGetById } from '@/services/apis/gen/queries';
import { useParams } from 'react-router-dom';
import { AssetSection } from './components/asset-section';
import { WorkflowSection } from './components/workflow-section';

export default function AssetGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { data } = useAssetGroupControllerGetById(id!);

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
        <AssetSection assetGroupId={id!} />
        <WorkflowSection assetGroupId={id!} />
      </div>
    </div>
  );
}
