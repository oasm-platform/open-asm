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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Crown,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserCog,
  UserPlus,
  X,
} from 'lucide-react';
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
import { useState } from 'react';
import { toast } from 'sonner';
import type {
  WorkspaceInvitation,
  WorkspaceMembers,
} from '@/services/apis/gen/queries';

const INVITATION_STATUS_VARIANT = {
  pending: 'warning',
  accepted: 'success',
  declined: 'secondary',
  expired: 'outline',
  cancelled: 'outline',
} as const;

const MEMBERS_TAB_VALUES = ['members', 'invitations', 'permissions'];

/**
 * Members settings page: members list, invitations and permission groups.
 * All mutations require the matching workspace permission; the backend
 * returns 403 when the current member lacks them.
 */
export default function MembersSettings() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const search = useSearch({ strict: false });
  const navigate = useNavigate();

  if (!selectedWorkspaceId) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-center text-muted-foreground">
            No workspace selected. Please select a workspace to manage its
            members.
          </p>
        </CardContent>
      </Card>
    );
  }

  const requestedTab = (search as Record<string, string>).tab;
  const tab = MEMBERS_TAB_VALUES.includes(requestedTab)
    ? requestedTab
    : 'members';
  const handleTabChange = (value: string) => {
    navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        tab: value,
      })) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
  };

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="pt-4">
          <MembersTab workspaceId={selectedWorkspaceId} />
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

function MembersTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const { data: members, isLoading } = useWorkspacesControllerGetWorkspaceMembers(
    {
      query: {
        queryKey: ['/api/workspaces/members', workspaceId],
        enabled: !!workspaceId,
      },
    },
  );
  const { data: groups } = useWorkspacesControllerGetPermissionGroups({
    query: {
      queryKey: ['/api/workspaces/permissions', workspaceId],
      enabled: !!workspaceId,
    },
  });

  const { mutate: updatePermissions } =
    useWorkspacesControllerUpdateMemberPermissions({
      mutation: {
        onSuccess: () => {
          toast.success('Member permissions updated');
          // Refresh the members list so the permission badges and dropdown
          // states reflect the new groups.
          queryClient.invalidateQueries({ queryKey: ['/api/workspaces/members'] });
          invalidateWorkspaceQueries(queryClient);
        },
        onError: () => toast.error('Failed to update member permissions'),
      },
    });
  const { mutate: removeMember } = useWorkspacesControllerRemoveMember({
    mutation: {
      onSuccess: () => {
        toast.success('Member removed');
        // Reload the members list so the removed member disappears.
        queryClient.invalidateQueries({ queryKey: ['/api/workspaces/members'] });
        invalidateWorkspaceQueries(queryClient);
      },
      onError: () => toast.error('Failed to remove member'),
    },
  });

  const editingMember = members?.find((member) => member.id === editingMemberId);

  const columns: ColumnDef<WorkspaceMembers>[] = [
    {
      id: 'member',
      header: 'Member',
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
              {row.original.user?.name ?? 'Unknown user'}
            </span>
            {isOwnerGroup(row.original.permissionGroups) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Crown size={16} className="text-yellow-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Owner</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'permission',
      header: 'Permission',
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
                  Change permission
                </DropdownMenuItem>
                <ConfirmDialog
                  title="Remove member"
                  description={`Remove ${row.original.user?.name ?? 'this member'} from the workspace? They will lose access immediately.`}
                  confirmText="Remove"
                  onConfirm={() => removeMember({ memberId: row.original.id })}
                  trigger={
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={isOwner}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4" />
              Invite member
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
      </div>

      <DataTable
        columns={columns}
        data={members ?? []}
        isLoading={isLoading}
        page={1}
        pageSize={Math.max(members?.length ?? 0, 5)}
        totalItems={members?.length ?? 0}
        showPagination={false}
        emptyMessage="No members in this workspace."
      />

      <Dialog
        open={!!editingMemberId}
        onOpenChange={(open) => !open && setEditingMemberId(null)}
      >
        <DialogContent>
          {editingMember && (
            <EditMemberPermissionsContent
              memberName={editingMember.user?.name ?? 'Member'}
              groups={groups ?? []}
              assignedGroupIds={
                editingMember.permissionGroups?.map((group) => group.id) ?? []
              }
              onSave={(permissionIds) => {
                updatePermissions({
                  memberId: editingMember.id,
                  data: { permissionIds },
                });
                setEditingMemberId(null);
              }}
              onClose={() => setEditingMemberId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvitationsTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { data: invitations, isLoading } =
    useWorkspacesControllerListInvitations({
      query: {
        queryKey: ['/api/workspaces/invitations', workspaceId],
        enabled: !!workspaceId,
      },
    });
  const { mutate: cancelInvitation } = useWorkspacesControllerCancelInvitation({
    mutation: {
      onSuccess: () => {
        toast.success('Invitation cancelled');
        invalidateWorkspaceQueries(queryClient);
      },
      onError: () => toast.error('Failed to cancel invitation'),
    },
  });

  const columns: ColumnDef<WorkspaceInvitation>[] = [
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue('email')}</span>
      ),
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: ({ row }) =>
        new Date(row.getValue('expiresAt') as string).toLocaleString(),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant={
            INVITATION_STATUS_VARIANT[
              row.original.status as keyof typeof INVITATION_STATUS_VARIANT
            ] ?? 'outline'
          }
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        if (row.original.status !== 'pending') return null;
        return (
          <div className="flex justify-end">
            <ConfirmDialog
              title="Cancel invitation"
              description={`Cancel the invitation for ${row.original.email}? Their invite link will stop working.`}
              confirmText="Cancel invitation"
              onConfirm={() => cancelInvitation({ invitationId: row.original.id })}
              trigger={
                <Button variant="ghost" size="sm">
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              }
            />
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={invitations ?? []}
      isLoading={isLoading}
      page={1}
      pageSize={Math.max(invitations?.length ?? 0, 5)}
      totalItems={invitations?.length ?? 0}
      showPagination={false}
      emptyMessage="No invitations sent."
    />
  );
}

function PermissionsTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [formSheet, setFormSheet] = useState<
    { mode: 'create' } | { mode: 'edit'; groupId: string } | null
  >(null);
  const { data: groups, isLoading } = useWorkspacesControllerGetPermissionGroups(
    {
      query: {
        queryKey: ['/api/workspaces/permissions', workspaceId],
        enabled: !!workspaceId,
      },
    },
  );
  const { mutate: deleteGroup } = useWorkspacesControllerDeletePermissionGroup({
    mutation: {
      onSuccess: () => {
        toast.success('Permission group deleted');
        // Reload the permission groups list and the members list (member
        // badges reference group names).
        queryClient.invalidateQueries({
          queryKey: ['/api/workspaces/permissions'],
        });
        queryClient.invalidateQueries({ queryKey: ['/api/workspaces/members'] });
        invalidateWorkspaceQueries(queryClient);
      },
      onError: () => toast.error('Failed to delete permission group'),
    },
  });

  const columns: ColumnDef<WorkspacePermissionLike>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.getValue('name')}</span>
          {row.original.isSystem && <Badge variant="soft">System</Badge>}
        </div>
      ),
    },
    {
      accessorKey: 'permissions',
      header: 'Permissions',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.permissions ?? []).map((key) => (
            <Badge key={key} variant="outline">
              {key}
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
                    Edit
                  </DropdownMenuItem>
                <ConfirmDialog
                  title="Delete permission group"
                  description={`Delete "${row.original.name}"? Members assigned this group will lose its permissions.`}
                  confirmText="Delete"
                  onConfirm={() =>
                    deleteGroup({ permissionId: row.original.id })
                  }
                  trigger={
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4" />
                      Delete
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setFormSheet({ mode: 'create' })}>
          <Plus className="h-4 w-4" />
          Create group
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={groups ?? []}
        isLoading={isLoading}
        page={1}
        pageSize={Math.max(groups?.length ?? 0, 5)}
        totalItems={groups?.length ?? 0}
        showPagination={false}
        emptyMessage="No permission groups in this workspace."
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
  const [emailsText, setEmailsText] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const { mutate: createInvitations, isPending } =
    useWorkspacesControllerCreateInvitations({
      mutation: {
        onSuccess: (data) => {
          if (data.skipped.length > 0) {
            toast.warning(
              `Invited ${data.invited.length} user${data.invited.length === 1 ? '' : 's'}. Skipped: ${data.skipped.join(', ')}`,
            );
          } else {
            toast.success(
              `Invited ${data.invited.length} user${data.invited.length === 1 ? '' : 's'}`,
            );
          }
          invalidateWorkspaceQueries(queryClient);
          onClose();
        },
        onError: () => toast.error('Failed to create invitations'),
      },
    });

  const emails = emailsText
    .split(/[\s,]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite members</DialogTitle>
        <DialogDescription>
          Invite existing users by email. They will receive an in-app
          notification with an accept link.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite-emails">Emails</Label>
          <Textarea
            id="invite-emails"
            placeholder="user@example.com, another@example.com"
            value={emailsText}
            onChange={(event) => setEmailsText(event.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            One or more emails, separated by commas or new lines. Users without
            an account are skipped.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Permission groups</Label>
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No permission groups yet. Create one in the Permissions tab.
            </p>
          ) : (
            <div className="grid gap-2">
              {groups
                .filter((group) => !group.isSystem)
                .map((group) => (
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
          Cancel
        </Button>
        <Button
          disabled={emails.length === 0 || isPending}
          onClick={() =>
            createInvitations({
              data: { emails, permissionIds: selectedGroupIds },
            })
          }
        >
          {isPending ? 'Inviting...' : 'Send invitations'}
        </Button>
      </DialogFooter>
    </>
  );
}

function EditMemberPermissionsContent({
  memberName,
  groups,
  assignedGroupIds,
  onSave,
  onClose,
}: {
  memberName: string;
  groups: WorkspacePermissionLike[];
  assignedGroupIds: string[];
  onSave: (permissionIds: string[]) => void;
  onClose: () => void;
}) {
  const [selectedGroupIds, setSelectedGroupIds] =
    useState<string[]>(assignedGroupIds);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Change permission</DialogTitle>
        <DialogDescription>
          Permission groups for {memberName}. Changes apply immediately.
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
            No permission groups in this workspace.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(selectedGroupIds)}>Save</Button>
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
