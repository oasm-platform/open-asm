import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useWorkspacesControllerDeleteWorkspace,
  type Workspace,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

interface DeleteWorkspaceProps {
  workspace: Workspace;
}
const DeleteWorkspace = (props: DeleteWorkspaceProps) => {
  const queryClient = useQueryClient();

  const { workspace } = props;
  const { mutate } = useWorkspacesControllerDeleteWorkspace();
  const handleDelete = () => {
    mutate(
      {
        id: workspace.id,
      },
      {
        onSuccess: () => {
          toast.success('Workspace deleted');
          queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        },
        onError: () => {
          toast.error('Failed to delete workspace');
        },
      },
    );
  };
  return (
    <ConfirmDialog
      title="Delete workspace"
      description={`Are you sure you want to delete workspace "${workspace.name}"? All related data including assets, vulnerabilities, scan results, and settings will be permanently deleted and cannot be recovered.`}
      onConfirm={handleDelete}
      confirmText={'Delete'}
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
