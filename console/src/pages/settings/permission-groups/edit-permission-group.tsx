import { PermissionGroupForm } from '@/pages/settings/components/permission-group-form';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerGetPermissionCatalog,
  useWorkspacesControllerGetPermissionGroups,
  useWorkspacesControllerUpdatePermissionGroup,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';

/**
 * Edit permission group page. Opens on its own route
 * (/settings/members/permission-groups/:permissionId) from the Permissions tab.
 */
export default function EditPermissionGroupPage({
  permissionId,
}: {
  permissionId: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data: catalog } = useWorkspacesControllerGetPermissionCatalog();
  const { data: groups, isLoading } = useWorkspacesControllerGetPermissionGroups(
    {
      query: {
        queryKey: ['/api/workspaces/permissions', selectedWorkspaceId],
        enabled: !!selectedWorkspaceId,
      },
    },
  );
  const { mutate: updateGroup, isPending } =
    useWorkspacesControllerUpdatePermissionGroup({
      mutation: {
        onSuccess: () => {
          toast.success(t('settings.groupForm.updated'));
          queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
          navigate({
            to: '/settings/$tab',
            params: { tab: 'members' },
            search: { tab: 'permissions' },
          });
        },
        onError: () => toast.error(t('settings.groupForm.updateFailed')),
      },
    });

  const goBack = () =>
    navigate({
      to: '/settings/$tab',
      params: { tab: 'members' },
      search: { tab: 'permissions' },
    });

  if (!selectedWorkspaceId) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-center text-muted-foreground">
            {t('settings.members.noWorkspace')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full sm:w-3/4 xl:w-1/2">
        <p className="text-sm text-muted-foreground">
          {t('settings.groupForm.loadingGroup')}
        </p>
      </div>
    );
  }

  const group = groups?.find((item) => item.id === permissionId);

  if (!group) {
    return (
      <div className="mx-auto w-full sm:w-3/4 xl:w-1/2">
        <p className="text-sm text-muted-foreground">
          {t('settings.groupForm.notFound')}
        </p>
        <button
          type="button"
          className="text-sm text-primary underline"
          onClick={goBack}
        >
          {t('settings.groupForm.backToMembers')}
        </button>
      </div>
    );
  }

  return (
    <PermissionGroupForm
      catalog={catalog ?? []}
      groups={groups ?? []}
      title={t('settings.groupForm.editTitle')}
      description={t('settings.groupForm.description')}
      submitText={t('common.save')}
      initialName={group.name}
      initialPermissions={group.permissions}
      isPending={isPending}
      onSave={(name, permissions) =>
        updateGroup({
          permissionId: group.id,
          data: { name, permissions },
        })
      }
      onCancel={goBack}
    />
  );
}
