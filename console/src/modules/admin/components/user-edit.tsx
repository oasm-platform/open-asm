import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getAdminUsersControllerGetUserQueryKey,
  getAdminUsersControllerGetUsersQueryKey,
  type AdminUserDto,
} from '@/services/apis/gen/queries';
import { authClient, useSession } from '@/utils/authClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

type EditableRole = 'admin' | 'user';

const BAN_DURATIONS = [
  { value: 'permanent', label: 'Permanent', seconds: undefined },
  { value: '1d', label: '1 day', seconds: 60 * 60 * 24 },
  { value: '7d', label: '7 days', seconds: 60 * 60 * 24 * 7 },
  { value: '30d', label: '30 days', seconds: 60 * 60 * 24 * 30 },
] as const;

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Invalid email address'),
});

const passwordSchema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm the password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

/**
 * better-auth client calls resolve with `{ error }` instead of rejecting.
 * Throw it so useMutation's onError fires and the server message is shown.
 */
async function unwrap(call: Promise<{ error: { message?: string } | null }>) {
  const { error } = await call;
  if (error) throw new Error(error.message || 'Request failed');
}

/** Refresh this user's page and the users table (role / status badges). */
function useRefreshUser(userId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getAdminUsersControllerGetUserQueryKey(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: getAdminUsersControllerGetUsersQueryKey(),
      }),
    ]);
}

function SubmitButton({
  isPending,
  disabled,
  children,
  variant,
}: {
  isPending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'default' | 'destructive';
}) {
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={isPending || disabled}
      className="gap-1.5"
    >
      {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

function ProfileForm({ user }: { user: AdminUserDto }) {
  const refreshUser = useRefreshUser(user.id);
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, email: user.email },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (values: z.infer<typeof profileSchema>) => {
      // Send only what changed: an unchanged email would still be re-validated.
      const data: Partial<z.infer<typeof profileSchema>> = {};
      if (values.name !== user.name) data.name = values.name;
      if (values.email !== user.email) data.email = values.email;
      // Dirty only by whitespace that the schema trims away: nothing to send.
      if (Object.keys(data).length === 0) return Promise.resolve();
      return unwrap(authClient.admin.updateUser({ userId: user.id, data }));
    },
    onSuccess: (_, values) => {
      toast.success('Profile updated.');
      form.reset(values);
      return refreshUser();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update profile.');
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          The user's display name and the email they sign in with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} disabled={isPending} />
                  </FormControl>
                  <FormDescription>
                    The user signs in with the new email from their next login.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => form.reset()}
                disabled={isPending || !form.formState.isDirty}
              >
                Discard
              </Button>
              <SubmitButton
                isPending={isPending}
                disabled={!form.formState.isDirty}
              >
                Save changes
              </SubmitButton>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RoleForm({ user, isSelf }: { user: AdminUserDto; isSelf: boolean }) {
  const refreshUser = useRefreshUser(user.id);
  const [role, setRole] = useState<EditableRole>(
    user.role === 'admin' ? 'admin' : 'user',
  );

  const { mutate, isPending } = useMutation({
    mutationFn: (next: EditableRole) =>
      unwrap(authClient.admin.setRole({ userId: user.id, role: next })),
    onSuccess: () => {
      toast.success('Role updated.');
      return refreshUser();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update role.');
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Role</CardTitle>
        <CardDescription>
          Admins can manage users, workspaces and system settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate(role);
          }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="user-role">Platform role</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as EditableRole)}
              disabled={isPending || isSelf}
            >
              <SelectTrigger id="user-role" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {isSelf && (
              <p className="text-xs text-muted-foreground">
                You can't change your own role.
              </p>
            )}
          </div>
          <SubmitButton
            isPending={isPending}
            disabled={isSelf || role === user.role}
          >
            Update role
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm({ user }: { user: AdminUserDto }) {
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ newPassword }: z.infer<typeof passwordSchema>) =>
      unwrap(
        authClient.admin.setUserPassword({ userId: user.id, newPassword }),
      ),
    onSuccess: () => {
      toast.success('Password updated.');
      form.reset();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update password.');
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Set a new password for this user. Share it with them over a secure
          channel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutate(values))}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder="Min. 8 characters"
                        {...field}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...field}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end">
              <SubmitButton
                isPending={isPending}
                disabled={!form.formState.isDirty}
              >
                Set password
              </SubmitButton>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function BanSection({ user, isSelf }: { user: AdminUserDto; isSelf: boolean }) {
  const refreshUser = useRefreshUser(user.id);
  const [reason, setReason] = useState('');
  const [duration, setDuration] =
    useState<(typeof BAN_DURATIONS)[number]['value']>('permanent');

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (user.banned) {
        return unwrap(authClient.admin.unbanUser({ userId: user.id }));
      }
      const banExpiresIn = BAN_DURATIONS.find(
        (d) => d.value === duration,
      )?.seconds;
      return unwrap(
        authClient.admin.banUser({
          userId: user.id,
          banReason: reason.trim() || undefined,
          banExpiresIn,
        }),
      );
    },
    onSuccess: () => {
      toast.success(user.banned ? 'User unbanned.' : 'User banned.');
      setReason('');
      setDuration('permanent');
      return refreshUser();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update user status.');
    },
  });

  return (
    <Card className="gap-4 border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          {user.banned
            ? 'This user is banned and cannot sign in.'
            : 'Banning revokes access to the platform. Their workspace data is preserved.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium">
            {user.banned ? 'Unban user' : 'Ban user'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isSelf
              ? "You can't ban your own account."
              : user.banned
                ? 'Restore access so they can sign in again.'
                : 'Sign the user out and block new sign-ins.'}
          </p>
        </div>
        <ConfirmDialog
          title={user.banned ? 'Unban user' : 'Ban user'}
          description={
            user.banned
              ? `Restore access for ${user.name}? They will be able to sign in again.`
              : `Ban ${user.name}? They will lose access to the platform.`
          }
          onConfirm={() => mutate()}
          confirmText={user.banned ? 'Unban' : 'Ban'}
          trigger={
            <Button
              variant={user.banned ? 'outline' : 'destructive'}
              size="sm"
              className="gap-1.5"
              disabled={isPending || isSelf}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
              {user.banned ? 'Unban user' : 'Ban user'}
            </Button>
          }
        >
          {!user.banned && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="ban-reason">Reason (optional)</Label>
                <Input
                  id="ban-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Violated acceptable use policy"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ban-duration">Duration</Label>
                <Select
                  value={duration}
                  onValueChange={(value) =>
                    setDuration(value as typeof duration)
                  }
                >
                  <SelectTrigger id="ban-duration" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BAN_DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </ConfirmDialog>
      </CardContent>
    </Card>
  );
}

/** Editable settings of a user account, one form per concern. */
export function UserEdit({ user }: { user: AdminUserDto }) {
  const { data: session } = useSession();
  const isSelf = session?.user.id === user.id;

  return (
    <div className="space-y-4">
      <ProfileForm user={user} />
      <RoleForm user={user} isSelf={isSelf} />
      <PasswordForm user={user} />
      <BanSection user={user} isSelf={isSelf} />
    </div>
  );
}
