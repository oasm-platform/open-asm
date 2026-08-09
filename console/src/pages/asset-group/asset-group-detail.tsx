import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useAssetGroupControllerDelete,
  useAssetGroupControllerGetById,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Trash } from 'lucide-react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import AssetGroupWorkflow from './components/asset-group-workflow';
import { AssetSection } from './components/asset-section';
import { EditAssetGroupDialog } from './components/edit-asset-group-dialog';

export default function AssetGroupDetail() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data, refetch } = useAssetGroupControllerGetById(id!);
  const { mutate, isPending } = useAssetGroupControllerDelete();
  const queryClient = useQueryClient();

  const handleDelete = () => {
    mutate(
      { id: id! },
      {
        onSuccess: () => {
          toast('Automation group deleted successfully');
          // Invalidate the list cache so the deleted group disappears from
          // the asset groups list when navigating back.
          queryClient.invalidateQueries({ queryKey: ['asset-group'] });
          // Navigate to the asset groups list after successful deletion
          navigate({ to: '/groups' });
        },
        onError: () => {
          toast.error('Failed to delete automation group');
        },
      },
    );
  };

  if (!data) return <div></div>;

  return (
    <Page
      permission="group.read"
      isShowButtonGoBack
      title={
        <div className="flex items-center gap-2">
          <span>{data?.name}</span>
          <div
            className={`h-4 w-4 rounded-full`}
            style={{ background: data?.hexColor }}
          />
        </div>
      }
      header={
        <div className="flex items-center gap-2 w-full">
          <EditAssetGroupDialog assetGroup={data} onSuccess={refetch} />
          <ConfirmDialog
            title="Delete automation group"
            description={`Are you sure you want to delete "${data?.name}"? This action cannot be undone.`}
            onConfirm={handleDelete}
            typeToConfirm="delete"
            trigger={
              <Button size="icon" variant="ghost">
                <Trash color="red" />
              </Button>
            }
            disabled={isPending}
          />
        </div>
      }
    >
      <AssetGroupWorkflow
        assetGroupId={id!}
        workflows={data.assetGroupWorkflows ?? []}
        onRefetch={refetch}
      />
      <AssetSection assetGroupId={id!} />
    </Page>
  );
}
