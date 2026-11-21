import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerCreatePermissionGroup,
  useWorkspacesControllerGetPermissionCatalog,
  useWorkspacesControllerGetPermissionGroups,
  useWorkspacesControllerUpdatePermissionGroup,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';
import { PermissionGroupForm } from './permission-group-form';

interface PermissionGroupFormSheetProps {
  open: boolean;
  /** 'create' opens an empty form, 'edit' pre-fills the group with groupId */
  mode: 'create' | 'edit';
  groupId?: string;
  onClose: () => void;
}

/**
 * Create/edit permission group form rendered in a right-hand sheet, opened
 * directly from the Permissions tab of the members settings page.
 */
export function PermissionGroupFormSheet({
  open,
  mode,
  groupId,
  onClose,
}: PermissionGroupFormSheetProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data: catalog } = useWorkspacesControllerGetPermissionCatalog();
  const { data: groups } = useWorkspacesControllerGetPermissionGroups({
    query: {
      queryKey: ['/api/workspaces/permissions', selectedWorkspaceId],
      enabled: !!selectedWorkspaceId && open,
    },
  });

  const { mutate: createGroup, isPending: isCreating } =
    useWorkspacesControllerCreatePermissionGroup({
      mutation: {
        onSuccess: () => {
          toast.success(t('settings.groupForm.created'));
          queryClient.invalidateQueries({
            queryKey: ['/api/workspaces/permissions'],
          });
          queryClient.invalidateQueries({
            queryKey: ['/api/workspaces/members'],
          });
          onClose();
        },
        onError: () => toast.error(t('settings.groupForm.createFailed')),
      },
    });
  const { mutate: updateGroup, isPending: isUpdating } =
    useWorkspacesControllerUpdatePermissionGroup({
      mutation: {
        onSuccess: () => {
          toast.success(t('settings.groupForm.updated'));
          queryClient.invalidateQueries({
            queryKey: ['/api/workspaces/permissions'],
          });
          queryClient.invalidateQueries({
            queryKey: ['/api/workspaces/members'],
          });
          onClose();
        },
        onError: () => toast.error(t('settings.groupForm.updateFailed')),
      },
    });

  const editingGroup =
    mode === 'edit' ? groups?.find((group) => group.id === groupId) : undefined;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto px-4 pb-4 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="sr-only">
            {mode === 'create' ? t('settings.groupForm.createTitle') : t('settings.groupForm.editTitle')}
          </SheetTitle>
        </SheetHeader>
        <PermissionGroupForm
          className="w-full sm:w-full xl:w-full"
          bare
          // Remount when the editing group resolves so the form re-inits from
          // the fetched group instead of showing stale/empty initial values.
          key={editingGroup?.id ?? 'create'}
          catalog={catalog ?? []}
          groups={groups ?? []}
          title={
            mode === 'create' ? t('settings.groupForm.createTitle') : t('settings.groupForm.editTitle')
          }
          description={t('settings.groupForm.description')}
          submitText={
            mode === 'create' ? t('settings.members.groups.create') : t('common.save')
          }
          initialName={editingGroup?.name}
          initialPermissions={editingGroup?.permissions}
          isPending={isCreating || isUpdating}
          onSave={(name, permissions) =>
            mode === 'create'
              ? createGroup({ data: { name, permissions } })
              : updateGroup({
                  permissionId: groupId as string,
                  data: { name, permissions },
                })
          }
          onCancel={onClose}
        />
      </SheetContent>
    </Sheet>
  );
}
