import { PermissionGroupForm } from '@/pages/settings/components/permission-group-form';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerCreatePermissionGroup,
  useWorkspacesControllerGetPermissionCatalog,
  useWorkspacesControllerGetPermissionGroups,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';

/**
 * Create permission group page. Opens on its own route
 * (/settings/members/permission-groups/new) from the Permissions tab.
 */
export default function NewPermissionGroupPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data: catalog } = useWorkspacesControllerGetPermissionCatalog();
  const { data: groups, isLoading } =
    useWorkspacesControllerGetPermissionGroups({
      query: {
        queryKey: ['/api/workspaces/permissions', selectedWorkspaceId],
        enabled: !!selectedWorkspaceId,
      },
    });
  const { mutate: createGroup, isPending } =
    useWorkspacesControllerCreatePermissionGroup({
      mutation: {
        onSuccess: () => {
          toast.success(t('settings.groupForm.created'));
          queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
          navigate({
            to: '/settings/$tab',
            params: { tab: 'members' },
            search: { tab: 'permissions' },
          });
        },
        onError: () => toast.error(t('settings.groupForm.createFailed')),
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
          {t('settings.groupForm.loadingGroups')}
        </p>
      </div>
    );
  }

  return (
    <PermissionGroupForm
      catalog={catalog ?? []}
      groups={groups ?? []}
      title={t('settings.groupForm.createTitle')}
      description={t('settings.groupForm.description')}
      submitText={t('settings.members.groups.create')}
      isPending={isPending}
      onSave={(name, permissions) =>
        createGroup({ data: { name, permissions } })
      }
      onCancel={goBack}
    />
  );
}
