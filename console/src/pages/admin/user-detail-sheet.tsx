import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/utils/authClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { type User } from '@/utils/authClient';
import { Button } from '@/components/ui/button';
import { Trash2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

interface UserDetailSheetProps {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}

/** A row in the Overview tab with a label+description on the left and an action on the right. */
function ActionRow({
  label,
  description,
  action,
  danger = false,
}: {
  label: string;
  description: string;
  action: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="grid gap-0.5 min-w-0">
        <p className={cn('text-sm font-medium', danger && 'text-destructive')}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/**
 * User detail sheet component displaying a Supabase-style overview of a user,
 * with provider information, management actions, and raw JSON data.
 *
 * @param user - The user whose details are displayed (null when sheet is closed).
 * @param onOpenChange - Callback to close the sheet.
 */
export function UserDetailSheet({ user, onOpenChange }: UserDetailSheetProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user', user?.id],
    queryFn: () => authClient.admin.getUser({ query: { id: user!.id } }),
    enabled: !!user,
  });

  const aUser = data?.data as User | undefined;

  const { mutate: toggleBan, isPending: isBanning } = useMutation({
    mutationFn: async () => {
      if (!aUser) return;
      const action = aUser.banned
        ? authClient.admin.unbanUser
        : authClient.admin.banUser;
      await action({ userId: aUser.id });
    },
    onSuccess: () => {
      toast.success(`User has been ${aUser?.banned ? 'unbanned' : 'banned'}.`);
      return queryClient.invalidateQueries({ queryKey: ['user', aUser?.id] });
    },
    onError: () => {
      toast.error('Failed to update user status.');
    },
  });

  const { mutate: setRole, isPending: isSettingRole } = useMutation({
    mutationFn: async (role: 'admin' | 'user') => {
      if (!aUser) return;
      await authClient.admin.setRole({ userId: aUser.id, role });
    },
    onSuccess: () => {
      toast.success('User role updated.');
      return queryClient.invalidateQueries({ queryKey: ['user', aUser?.id] });
    },
    onError: () => {
      toast.error('Failed to update user role.');
    },
  });

  const { mutate: deleteUser, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      if (!aUser) return;
      await authClient.admin.removeUser({ userId: aUser.id });
    },
    onSuccess: () => {
      toast.success('User deleted successfully.');
      onOpenChange(false);
      return queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      toast.error('Failed to delete user.');
    },
  });

  return (
    <Sheet open={!!user} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col gap-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          {isLoading && (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
              <div className="grid gap-1.5">
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                <div className="h-3 w-48 bg-muted rounded animate-pulse" />
              </div>
            </div>
          )}
          {aUser && (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border">
                <AvatarImage src={aUser.image ?? undefined} alt={aUser.name} />
                <AvatarFallback>
                  {aUser.name?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">
                    {aUser.name}
                  </span>
                  {aUser.banned ? (
                    <Badge variant="destructive" className="text-xs">
                      Banned
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate">
                  {aUser.email}
                </span>
              </div>
            </div>
          )}
        </SheetHeader>

        {/* Tabs */}
        {aUser && (
          <Tabs
            defaultValue="overview"
            className="flex flex-col flex-1 min-h-0"
          >
            <TabsList className="mx-6 mt-4 mb-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="raw-json">Raw JSON</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent
              value="overview"
              className="flex-1 overflow-y-auto mt-0 px-6 pb-6"
            >
              {/* Provider Information */}
              {/* <section className="py-4">
                <p className="text-sm font-semibold mb-0.5">
                  Provider Information
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  The user has the following providers
                </p>
                <div className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="grid gap-0.5 flex-1 min-w-0">
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-xs text-muted-foreground">
                        Signed in with an email account via OAuth
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Enabled
                    </Badge>
                  </div>
                </div>
              </section>

              <Separator /> */}

              {/* Action rows */}
              {/* <section>
                <ActionRow
                  label="Reset password"
                  description="Send a password recovery email to the user"
                  action={
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Send password recovery
                    </Button>
                  }
                />
                <Separator />
                <ActionRow
                  label="Send confirmation email"
                  description="Send a confirmation email to the user"
                  action={
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Send confirmation email
                    </Button>
                  }
                />
              </section>

              <Separator /> */}

              {/* User Information */}
              <section className="py-4">
                <p className="text-sm font-semibold mb-3">User Information</p>
                <div className="rounded-lg border divide-y text-sm">
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-xs text-muted-foreground shrink-0 w-28">
                      User ID
                    </span>
                    <span className="text-xs font-mono truncate text-right">
                      {aUser.id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-xs text-muted-foreground shrink-0 w-28">
                      Display name
                    </span>
                    <span className="text-xs truncate text-right">
                      {aUser.name || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-xs text-muted-foreground shrink-0 w-28">
                      Email
                    </span>
                    <span className="text-xs truncate text-right">
                      {aUser.email}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-xs text-muted-foreground shrink-0 w-28">
                      Email verified
                    </span>
                    {aUser.emailVerified ? (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      >
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Unverified
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-xs text-muted-foreground shrink-0 w-28">
                      Role
                    </span>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {aUser.role}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-xs text-muted-foreground shrink-0 w-28">
                      Status
                    </span>
                    {aUser.banned ? (
                      <Badge variant="destructive" className="text-xs">
                        Banned
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-xs text-muted-foreground shrink-0 w-28">
                      Joined
                    </span>
                    <span className="text-xs text-right">
                      {aUser.createdAt
                        ? format(new Date(aUser.createdAt), 'PPP')
                        : '—'}
                    </span>
                  </div>
                </div>
              </section>

              <Separator />

              {/* Danger zone */}

              <section className="py-4">
                <p className="text-sm font-semibold text-destructive mb-0.5">
                  Danger zone
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Be wary of the following features as they cannot be undone.
                </p>
                <div className="rounded-lg border border-destructive/30 divide-y divide-destructive/20">
                  <div className="px-4">
                    <ActionRow
                      label="Change role"
                      description="Set the user's access level"
                      danger
                      action={
                        <Select
                          defaultValue={aUser.role}
                          onValueChange={(value) =>
                            setRole(value as 'admin' | 'user')
                          }
                          disabled={isSettingRole}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-sm">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="user">User</SelectItem>
                          </SelectContent>
                        </Select>
                      }
                    />
                  </div>
                  <div className="px-4">
                    <ActionRow
                      label={aUser.banned ? 'Unban user' : 'Ban user'}
                      description={
                        aUser.banned
                          ? 'Restore access to the project for this user'
                          : 'Revoke access to the project for a set duration'
                      }
                      danger
                      action={
                        <ConfirmDialog
                          title={aUser.banned ? 'Unban User' : 'Ban User'}
                          description={
                            aUser.banned
                              ? `Restore access for ${aUser.name}? They will be able to sign in again.`
                              : `Ban ${aUser.name}? They will lose access to the project.`
                          }
                          onConfirm={() => toggleBan()}
                          confirmText={aUser.banned ? 'Unban' : 'Ban'}
                          cancelText="Cancel"
                          trigger={
                            <Button
                              variant={aUser.banned ? 'outline' : 'destructive'}
                              size="sm"
                              className="gap-1.5"
                              disabled={isBanning}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              {aUser.banned ? 'Unban user' : 'Ban user'}
                            </Button>
                          }
                        />
                      }
                    />
                  </div>
                  <div className="px-4">
                    <ActionRow
                      label="Delete user"
                      description="User will no longer have access to the project"
                      danger
                      action={
                        <ConfirmDialog
                          title="Delete User"
                          description={`Are you sure you want to delete ${aUser.name}? This action cannot be undone.`}
                          onConfirm={() => deleteUser()}
                          confirmText="Delete"
                          cancelText="Cancel"
                          trigger={
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-1.5"
                              disabled={isDeleting}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete user
                            </Button>
                          }
                        />
                      }
                    />
                  </div>
                </div>
              </section>
            </TabsContent>

            {/* Raw JSON Tab */}
            <TabsContent
              value="raw-json"
              className="flex-1 overflow-y-auto mt-0 px-6 pb-6 pt-4"
            >
              <div className="rounded-lg border bg-muted/40 p-4 overflow-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
                  {JSON.stringify(aUser, null, 2)}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Empty state while loading */}
        {!aUser && !isLoading && (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">No user selected.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
