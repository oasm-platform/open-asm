import { PermissionGroupForm } from '@/pages/settings/components/permission-group-form';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerCreatePermissionGroup,
  useWorkspacesControllerGetPermissionCatalog,
  useWorkspacesControllerGetPermissionGroups,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

/**
 * Create permission group page. Opens on its own route
 * (/settings/members/permission-groups/new) from the Permissions tab.
 */
export default function NewPermissionGroupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data: catalog } = useWorkspacesControllerGetPermissionCatalog();
  const { data: groups } = useWorkspacesControllerGetPermissionGroups({
    query: {
      queryKey: ['/api/workspaces/permissions', selectedWorkspaceId],
      enabled: !!selectedWorkspaceId,
    },
  });
  const { mutate: createGroup, isPending } =
    useWorkspacesControllerCreatePermissionGroup({
      mutation: {
        onSuccess: () => {
          toast.success('Permission group created');
          queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
          navigate({
            to: '/settings/$tab',
            params: { tab: 'members' },
            search: { tab: 'permissions' },
          });
        },
        onError: () => toast.error('Failed to create permission group'),
      },
    });

  const goBack = () =>
    navigate({
      to: '/settings/$tab',
      params: { tab: 'members' },
      search: { tab: 'permissions' },
    });

  return (
    <PermissionGroupForm
      catalog={catalog ?? []}
      groups={groups ?? []}
      title="Create permission group"
      description="A group bundles permission keys. Members are assigned whole groups."
      submitText="Create group"
      isPending={isPending}
      onSave={(name, permissions) =>
        createGroup({ data: { name, permissions } })
      }
      onCancel={goBack}
    />
  );
}
