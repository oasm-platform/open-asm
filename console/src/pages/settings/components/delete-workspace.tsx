import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerDeleteWorkspace,
  type Workspace,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';

interface DeleteWorkspaceProps {
  workspace: Workspace;
}
const DeleteWorkspace = (props: DeleteWorkspaceProps) => {
  const t = useT();
  const queryClient = useQueryClient();

  const { workspace } = props;
  const { mutate } = useWorkspacesControllerDeleteWorkspace();
  const { refetch } = useWorkspaceSelector();
  const handleDelete = () => {
    mutate(
      {
        id: workspace.id,
      },
      {
        onSuccess: () => {
          toast.success(t('settings.workspace.deletedShort'));
          queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
          refetch();
        },
        onError: () => {
          toast.error(t('settings.workspace.deleteFailed'));
        },
      },
    );
  };
  return (
    <ConfirmDialog
      title={t('settings.workspace.delete.title')}
      description={t('settings.workspace.delete.descriptionNamed', { name: workspace.name })}
      onConfirm={handleDelete}
      confirmText={t('common.delete')}
      typeToConfirm={'delete'}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-muted-foreground/80"
        >
          <Trash2Icon />
        </Button>
      }
    />
  );
};

export default DeleteWorkspace;
