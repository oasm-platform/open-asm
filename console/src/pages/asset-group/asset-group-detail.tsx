import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useAssetGroupControllerDelete,
  useAssetGroupControllerGetById,
} from '@/services/apis/gen/queries';
import { Trash } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import AssetGroupWorkflow from './components/asset-group-workflow';
import { AssetSection } from './components/asset-section';
import { EditAssetGroupDialog } from './components/edit-asset-group-dialog';

export default function AssetGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useAssetGroupControllerGetById(id!);
  const { mutate, isPending } = useAssetGroupControllerDelete();

  const handleDelete = () => {
    mutate(
      { id: id! },
      {
        onSuccess: () => {
          toast('Asset group deleted successfully');
          // Navigate back to the asset groups list after successful deletion
          window.history.back();
        },
        onError: () => {
          toast.error('Failed to delete asset group');
        },
      },
    );
  };

  if (!data) return <div></div>;

  return (
    <Page
      isShowButtonGoBack
      header={
        <div className="flex items-center gap-2 justify-between w-full">
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full`}
              style={{ background: data?.hexColor }}
            ></div>
            {data?.name}
            <EditAssetGroupDialog assetGroup={data} onSuccess={refetch} />
          </div>
          <ConfirmDialog
            title="Delete asset group"
            description={`Are you sure you want to delete "${data?.name}"? This action cannot be undone.`}
            onConfirm={handleDelete}
            typeToConfirm="delete"
            trigger={
              <Button variant="ghost">
                <Trash color="red" />
              </Button>
            }
            disabled={isPending}
          />
        </div>
      }
    >
      <AssetGroupWorkflow assetGroupId={id!} />
      <AssetSection assetGroupId={id!} />
    </Page>
  );
}
