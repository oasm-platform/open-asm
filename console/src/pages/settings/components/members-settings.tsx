import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { usePermission } from '@/hooks/usePermission';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Crown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserCog,
  UserPlus,
  X,
} from 'lucide-react';
import AccessDenied from '@/components/common/access-denied';
import { PermissionGroupFormSheet } from './permission-group-form-sheet';
import {
  useWorkspacesControllerCancelInvitation,
  useWorkspacesControllerCreateInvitations,
  useWorkspacesControllerDeletePermissionGroup,
  useWorkspacesControllerGetPermissionGroups,
  useWorkspacesControllerGetWorkspaceMembers,
  useWorkspacesControllerListInvitations,
  useWorkspacesControllerRemoveMember,
  useWorkspacesControllerUpdateMemberPermissions,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { t, useT } from '@/lib/i18n-dictionary';
import type {
  WorkspaceInvitation,
  WorkspaceMembers,
} from '@/services/apis/gen/queries';

function invitationStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return t('settings.members.invitations.status.pending');
    case 'accepted':
      return t('settings.members.invitations.status.accepted');
    case 'declined':
      return t('settings.members.invitations.status.declined');
    case 'expired':
      return t('settings.members.invitations.status.expired');
    case 'cancelled':
      return t('settings.members.invitations.status.cancelled');
    default:
      return status;
  }
}

const INVITATION_STATUS_VARIANT = {
  pending: 'warning',
  accepted: 'success',
  declined: 'secondary',
  expired: 'outline',
  cancelled: 'outline',
} as const;

/**
 * Members settings page: members list, invitations and permission groups.
 * All mutations require the matching workspace permission; the backend
 * returns 403 when the current member lacks them.
 */
export default function MembersSettings() {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const search = useSearch({ strict: false });
  const { hasPermission, isLoading: permissionLoading } = usePermission();
  const [tab, setTab] = useQueryTab({
    tabParam: 'tab',
    defaultValue: 'members',
    validValues: ['members', 'invitations', 'permissions'],
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

  if (permissionLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Members, invitations and permission groups are all read via member.*
  // endpoints, so viewing this page requires member.read.
  if (!hasPermission('member.read')) {
    return <AccessDenied />;
  }

  const inviteRequested = Boolean((search as Record<string, unknown>).invite);

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="members">{t('settings.members.tabs.members')}</TabsTrigger>
          <TabsTrigger value="invitations">{t('settings.members.tabs.invitations')}</TabsTrigger>
          <TabsTrigger value="permissions">{t('settings.members.tabs.permissions')}</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="pt-4">
          <MembersTab
            workspaceId={selectedWorkspaceId}
            defaultInviteOpen={inviteRequested}
          />
        </TabsContent>
        <TabsContent value="invitations" className="pt-4">
          <InvitationsTab workspaceId={selectedWorkspaceId} />
        </TabsContent>
        <TabsContent value="permissions" className="pt-4">
          <PermissionsTab workspaceId={selectedWorkspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MembersTab({
  workspaceId,
  defaultInviteOpen = false,
}: {
  workspaceId: string;
  defaultInviteOpen?: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(defaultInviteOpen);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { hasPermission } = usePermission();

  const {
    data: members,
    isLoading,
    isError,
    error,
    refetch,
  } = useWorkspacesControllerGetWorkspaceMembers({
    query: {
      queryKey: ['/api/workspaces/members', workspaceId],
      enabled: !!workspaceId,
    },
  });
  const { data: groups } = useWorkspacesControllerGetPermissionGroups({
    query: {
      queryKey: ['/api/workspaces/permissions', workspaceId],
      enabled: !!workspaceId,
    },
  });

  const { mutate: removeMember } = useWorkspacesControllerRemoveMember({
    mutation: {
      onSuccess: () => {
        toast.success(t('settings.members.removed'));
        // Reload the members list so the removed member disappears.
        queryClient.invalidateQueries({ queryKey: ['/api/workspaces/members'] });
        invalidateWorkspaceQueries(queryClient);
      },
    },
  });

  const canManageMembers = hasPermission('member.write');
  const canInvite = hasPermission('invitation.write');

  const editingMember = members?.find((member) => member.id === editingMemberId);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members ?? [];
    return (members ?? []).filter((member) =>
      (member.user?.name ?? '').toLowerCase().includes(query),
    );
  }, [members, search]);

  const columns: ColumnDef<WorkspaceMembers>[] = [
    {
      id: 'member',
      header: t('settings.members.columns.member'),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarImage
              src={row.original.user?.image as string | undefined}
            />
            <AvatarFallback>
              {(row.original.user?.name ?? '?').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">
              {row.original.user?.name ?? t('settings.members.unknownUser')}
            </span>
            {isOwnerGroup(row.original.permissionGroups) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Crown size={16} className="text-yellow-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t('settings.members.owner')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'permission',
      header: t('settings.members.columns.permission'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.permissionGroups ?? []).map((group) => (
            <Badge key={group.id} variant="secondary">
              {group.name}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        if (!canManageMembers) return null;
        const isOwner = isOwnerGroup(row.original.permissionGroups);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={isOwner}
                  onSelect={() => setEditingMemberId(row.original.id)}
                >
                  <UserCog className="h-4 w-4" />
                  {t('settings.members.changePermission')}
                </DropdownMenuItem>
                <ConfirmDialog
                  title={t('settings.members.remove.title')}
                  description={t('settings.members.remove.description', {
                    name: row.original.user?.name ?? t('settings.members.remove.thisMember'),
                  })}
                  confirmText={t('common.remove')}
                  onConfirm={() => removeMember({ memberId: row.original.id })}
                  trigger={
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={isOwner}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('common.remove')}
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  if (isError && isForbiddenError(error)) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder={t('settings.members.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 max-w-xs"
        />
        {canInvite && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <UserPlus className="h-4 w-4" />
                {t('settings.members.inviteMember')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <InviteMemberDialogContent
                groups={groups ?? []}
                onClose={() => setInviteOpen(false)}
                queryClient={queryClient}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredMembers}
        isLoading={isLoading}
        page={1}
        pageSize={Math.max(filteredMembers.length, 5)}
        totalItems={filteredMembers.length}
        showPagination={false}
        emptyMessage={t('settings.members.empty')}
        error={isError ? <LoadError onRetry={() => refetch()} /> : undefined}
      />

      <Dialog
        open={!!editingMemberId}
        onOpenChange={(open) => !open && setEditingMemberId(null)}
      >
        <DialogContent>
          {editingMember && (
            <EditMemberPermissionsContent
              memberId={editingMember.id}
              memberName={editingMember.user?.name ?? t('settings.members.columns.member')}
              groups={groups ?? []}
              assignedGroupIds={
                editingMember.permissionGroups?.map((group) => group.id) ?? []
              }
              onClose={() => setEditingMemberId(null)}
              queryClient={queryClient}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvitationsTab({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const { hasPermission } = usePermission();
  const {
    data: invitations,
    isLoading,
    isError,
    error,
    refetch,
  } = useWorkspacesControllerListInvitations({
    query: {
      queryKey: ['/api/workspaces/invitations', workspaceId],
      enabled: !!workspaceId,
    },
  });
  const { mutate: cancelInvitation } = useWorkspacesControllerCancelInvitation({
    mutation: {
      onSuccess: () => {
        toast.success(t('settings.members.invitations.cancelled'));
        invalidateWorkspaceQueries(queryClient);
      },
    },
  });

  const canManageInvites = hasPermission('invitation.write');

  const filteredInvitations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invitations ?? [];
    return (invitations ?? []).filter((invitation) =>
      invitation.email.toLowerCase().includes(query),
    );
  }, [invitations, search]);

  const { data: permissionGroups } = useWorkspacesControllerGetPermissionGroups({
    query: {
      queryKey: ['/api/workspaces/permissions', workspaceId],
      enabled: !!workspaceId,
    },
  });
  const groupNameById = useMemo(
    () =>
      new Map(
        (permissionGroups ?? []).map((group) => [group.id, group.name]),
      ),
    [permissionGroups],
  );
  const { mutate: resendInvitation } = useWorkspacesControllerCreateInvitations({
    mutation: {
      onSuccess: () => {
        toast.success(t('settings.members.invitations.resent'));
        invalidateWorkspaceQueries(queryClient);
      },
    },
  });

  const columns: ColumnDef<WorkspaceInvitation>[] = [
    {
      accessorKey: 'email',
      header: t('settings.members.invitations.columns.email'),
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue('email')}</span>
      ),
    },
    {
      accessorKey: 'expiresAt',
      header: t('settings.members.invitations.columns.expires'),
      cell: ({ row }) =>
        new Date(row.getValue('expiresAt') as string).toLocaleString(),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => (
        <Badge
          variant={
            INVITATION_STATUS_VARIANT[
              row.original.status as keyof typeof INVITATION_STATUS_VARIANT
            ] ?? 'outline'
          }
        >
          {invitationStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'permissionIds',
      header: t('settings.members.permissionGroups'),
      cell: ({ row }) => {
        const ids = row.original.permissionIds ?? [];
        if (ids.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {ids.map((id) => (
              <Badge key={id} variant="soft">
                {groupNameById.get(id) ?? t('settings.members.invitations.unknownGroup')}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const status = row.original.status;
        if (!canManageInvites) return null;
        if (status === 'pending') {
          return (
            <div className="flex justify-end">
              <ConfirmDialog
                title={t('settings.members.invitations.cancel.title')}
                description={t('settings.members.invitations.cancel.description', {
                  email: row.original.email,
                })}
                confirmText={t('settings.members.invitations.cancel.title')}
                onConfirm={() => cancelInvitation({ invitationId: row.original.id })}
                trigger={
                  <Button variant="ghost" size="sm">
                    <X className="h-4 w-4" />
                    {t('common.cancel')}
                  </Button>
                }
              />
            </div>
          );
        }
        if (status === 'expired' || status === 'cancelled') {
          return (
            <div className="flex justify-end">
              <ConfirmDialog
                title={t('settings.members.invitations.resend.title')}
                description={t('settings.members.invitations.resend.description', {
                  email: row.original.email,
                })}
                confirmText={t('settings.members.invitations.resend.title')}
                onConfirm={() =>
                  resendInvitation({
                    data: {
                      emails: [row.original.email],
                      permissionIds: row.original.permissionIds,
                    },
                  })
                }
                trigger={
                  <Button variant="ghost" size="sm">
                    <RotateCcw className="h-4 w-4" />
                    {t('settings.members.invitations.resend.button')}
                  </Button>
                }
              />
            </div>
          );
        }
        return null;
      },
    },
  ];

  if (isError && isForbiddenError(error)) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder={t('settings.members.invitations.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 max-w-xs"
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredInvitations}
        isLoading={isLoading}
        page={1}
        pageSize={Math.max(filteredInvitations.length, 5)}
        totalItems={filteredInvitations.length}
        showPagination={false}
        emptyMessage={t('settings.members.invitations.empty')}
        error={isError ? <LoadError onRetry={() => refetch()} /> : undefined}
      />
    </div>
  );
}

function PermissionsTab({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formSheet, setFormSheet] = useState<
    { mode: 'create' } | { mode: 'edit'; groupId: string } | null
  >(null);
  const { hasPermission } = usePermission();
  const {
    data: groups,
    isLoading,
    isError,
    error,
    refetch,
  } = useWorkspacesControllerGetPermissionGroups({
    query: {
      queryKey: ['/api/workspaces/permissions', workspaceId],
      enabled: !!workspaceId,
    },
  });
  const { mutate: deleteGroup } = useWorkspacesControllerDeletePermissionGroup({
    mutation: {
      onSuccess: () => {
        toast.success(t('settings.members.groups.deleted'));
        // Reload the permission groups list and the members list (member
        // badges reference group names).
        queryClient.invalidateQueries({
          queryKey: ['/api/workspaces/permissions'],
        });
        queryClient.invalidateQueries({ queryKey: ['/api/workspaces/members'] });
        invalidateWorkspaceQueries(queryClient);
      },
    },
  });

  const canManageGroups = hasPermission('workspace.write');

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return groups ?? [];
    return (groups ?? []).filter((group) =>
      group.name.toLowerCase().includes(query),
    );
  }, [groups, search]);

  const columns: ColumnDef<WorkspacePermissionLike>[] = [
    {
      accessorKey: 'name',
      header: t('common.name'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.getValue('name')}</span>
          {row.original.isSystem && (
            <Badge variant="soft">{t('settings.members.groups.system')}</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'permissions',
      header: t('settings.members.tabs.permissions'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.permissions ?? []).map((key) => (
            <Badge key={key} variant="outline">
              {key === '*' ? t('settings.members.groups.allPermissions') : key}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        if (row.original.isSystem) return null;
        if (!canManageGroups) return null;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                    onSelect={() =>
                      setFormSheet({ mode: 'edit', groupId: row.original.id })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                    {t('common.edit')}
                  </DropdownMenuItem>
                <ConfirmDialog
                  title={t('settings.members.groups.delete.title')}
                  description={t('settings.members.groups.delete.description', {
                    name: row.original.name,
                  })}
                  confirmText={t('common.delete')}
                  onConfirm={() =>
                    deleteGroup({ permissionId: row.original.id })
                  }
                  trigger={
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4" />
                      {t('common.delete')}
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  if (isError && isForbiddenError(error)) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder={t('settings.members.groups.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 max-w-xs"
        />
        {canManageGroups && (
          <Button
            size="sm"
            className="h-9"
            onClick={() => setFormSheet({ mode: 'create' })}
          >
            <Plus className="h-4 w-4" />
            {t('settings.members.groups.create')}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredGroups}
        isLoading={isLoading}
        page={1}
        pageSize={Math.max(filteredGroups.length, 5)}
        totalItems={filteredGroups.length}
        showPagination={false}
        emptyMessage={t('settings.members.groups.empty')}
        error={isError ? <LoadError onRetry={() => refetch()} /> : undefined}
      />

      <PermissionGroupFormSheet
        open={!!formSheet}
        mode={formSheet?.mode ?? 'create'}
        groupId={formSheet?.mode === 'edit' ? formSheet.groupId : undefined}
        onClose={() => setFormSheet(null)}
      />
    </div>
  );
}

function InviteMemberDialogContent({
  groups,
  onClose,
  queryClient,
}: {
  groups: WorkspacePermissionLike[];
  onClose: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [emailsText, setEmailsText] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const { mutate: createInvitations, isPending } =
    useWorkspacesControllerCreateInvitations({
      mutation: {
        onSuccess: (data) => {
          if (data.skipped > 0) {
            toast.warning(
              t('settings.members.invite.partial', {
                invited: t('settings.members.invite.invited', {
                  count: data.invited,
                }),
                skipped: t('settings.members.invite.skipped', {
                  count: data.skipped,
                }),
              }),
            );
          } else {
            toast.success(
              t('settings.members.invite.invited', { count: data.invited }),
            );
          }
          invalidateWorkspaceQueries(queryClient);
          onClose();
        },
      },
    });

  const emails = emailsText
    .split(/[\s,]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  const invitableGroups = groups.filter((group) => !group.isSystem);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('settings.members.invite.title')}</DialogTitle>
        <DialogDescription>
          {t('settings.members.invite.description')}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite-emails">{t('settings.members.invite.emails')}</Label>
          <Textarea
            id="invite-emails"
            placeholder="user@example.com, another@example.com"
            value={emailsText}
            onChange={(event) => setEmailsText(event.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {t('settings.members.invite.emailsHint')}
          </p>
        </div>
        <div className="space-y-2">
          <Label>{t('settings.members.permissionGroups')}</Label>
          {invitableGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('settings.members.invite.noGroups')}{' '}
              <button
                type="button"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
                onClick={() => {
                  navigate({
                    to: '/settings/$tab',
                    params: { tab: 'members' },
                    search: { tab: 'permissions' },
                  });
                  onClose();
                }}
              >
                {t('settings.members.invite.createGroupLink')}
              </button>
            </p>
          ) : (
            <div className="grid gap-2">
              {invitableGroups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedGroupIds.includes(group.id)}
                      onCheckedChange={(checked) => {
                        setSelectedGroupIds((current) =>
                          checked
                            ? [...current, group.id]
                            : current.filter((id) => id !== group.id),
                        );
                      }}
                    />
                    <span className="font-medium">{group.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {group.permissions.join(', ')}
                    </span>
                  </label>
                ))}
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={
            emails.length === 0 || selectedGroupIds.length === 0 || isPending
          }
          onClick={() =>
            createInvitations({
              data: { emails, permissionIds: selectedGroupIds },
            })
          }
        >
          {isPending ? t('settings.members.invite.sending') : t('settings.members.invite.send')}
        </Button>
      </DialogFooter>
    </>
  );
}

function EditMemberPermissionsContent({
  memberId,
  memberName,
  groups,
  assignedGroupIds,
  onClose,
  queryClient,
}: {
  memberId: string;
  memberName: string;
  groups: WorkspacePermissionLike[];
  assignedGroupIds: string[];
  onClose: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const t = useT();
  const [selectedGroupIds, setSelectedGroupIds] =
    useState<string[]>(assignedGroupIds);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutate: updatePermissions, isPending } =
    useWorkspacesControllerUpdateMemberPermissions({
      mutation: {
        onSuccess: () => {
          toast.success(t('settings.members.edit.updated'));
          // Refresh the members list so the permission badges and dropdown
          // states reflect the new groups.
          queryClient.invalidateQueries({ queryKey: ['/api/workspaces/members'] });
          invalidateWorkspaceQueries(queryClient);
          onClose();
        },
        onError: () => {
          setSubmitError(
            t('settings.members.edit.failed'),
          );
        },
      },
    });

  const handleSave = () => {
    setSubmitError(null);
    updatePermissions({
      memberId,
      data: { permissionIds: selectedGroupIds },
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('settings.members.changePermission')}</DialogTitle>
        <DialogDescription>
          {t('settings.members.edit.description', { name: memberName })}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        {groups
          .filter((group) => !group.isSystem)
          .map((group) => (
            <label key={group.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedGroupIds.includes(group.id)}
                onCheckedChange={(checked) => {
                  setSelectedGroupIds((current) =>
                    checked
                      ? [...current, group.id]
                      : current.filter((id) => id !== group.id),
                  );
                }}
              />
              <span className="font-medium">{group.name}</span>
              <span className="text-xs text-muted-foreground">
                {group.permissions.join(', ')}
              </span>
            </label>
          ))}
        {groups.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('settings.members.groups.empty')}
          </p>
        )}
      </div>
      {submitError && (
        <p className="text-sm text-destructive">{submitError}</p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={isPending || selectedGroupIds.length === 0}>
          {isPending ? t('settings.members.saving') : t('common.save')}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Minimal shape shared by generated WorkspacePermission and local usage */
type WorkspacePermissionLike = {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
};

function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <p>{t('settings.members.loadFailed')}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

function isForbiddenError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { response?: { status?: number } }).response?.status === 403;
}

function isOwnerGroup(
  groups: Array<{ isSystem?: boolean }> | undefined,
): boolean {
  return (groups ?? []).some((group) => group.isSystem);
}

function invalidateWorkspaceQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
}
