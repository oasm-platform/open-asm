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
  useSystemConfigsControllerGetSettings,
  type AdminUserDto,
} from '@/services/apis/gen/queries';
import { authClient, useSession } from '@/utils/authClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Loader2, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { type TFunction, t as translate, useT } from '@/lib/i18n-dictionary';

type EditableRole = 'admin' | 'user';

const BAN_DURATIONS = [
  { value: 'permanent', labelKey: 'admin.userEdit.ban.permanent', seconds: undefined },
  { value: '1d', labelKey: 'admin.userEdit.ban.1d', seconds: 60 * 60 * 24 },
  { value: '7d', labelKey: 'admin.userEdit.ban.7d', seconds: 60 * 60 * 24 * 7 },
  { value: '30d', labelKey: 'admin.userEdit.ban.30d', seconds: 60 * 60 * 24 * 30 },
] as const;

const createProfileSchema = (t: TFunction) =>
  z.object({
  name: z.string().trim().min(1, t('admin.userEdit.nameRequired')),
  email: z
    .string()
    .trim()
    .min(1, t('admin.userEdit.emailRequired'))
    .email(t('admin.userEdit.invalidEmail')),
});

type ProfileValues = z.infer<ReturnType<typeof createProfileSchema>>;

const createPasswordSchema = (t: TFunction) =>
  z
  .object({
    newPassword: z.string().min(8, t('admin.userEdit.passwordMin')),
    confirmPassword: z.string().min(1, t('admin.userEdit.confirmRequired')),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: t('admin.userEdit.passwordMismatch'),
    path: ['confirmPassword'],
  });

type PasswordValues = z.infer<ReturnType<typeof createPasswordSchema>>;

/**
 * better-auth client calls resolve with `{ error }` instead of rejecting.
 * Throw it so useMutation's onError fires and the server message is shown.
 */
async function unwrap(call: Promise<{ error: { message?: string } | null }>) {
  const { error } = await call;
  if (error) throw new Error(error.message || translate('admin.userEdit.requestFailed'));
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
  const t = useT();
  const profileSchema = useMemo(() => createProfileSchema(t), [t]);
  const refreshUser = useRefreshUser(user.id);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, email: user.email },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (values: ProfileValues) => {
      // Send only what changed: an unchanged email would still be re-validated.
      const data: Partial<ProfileValues> = {};
      if (values.name !== user.name) data.name = values.name;
      if (values.email !== user.email) data.email = values.email;
      // Dirty only by whitespace that the schema trims away: nothing to send.
      if (Object.keys(data).length === 0) return Promise.resolve();
      return unwrap(authClient.admin.updateUser({ userId: user.id, data }));
    },
    onSuccess: (_, values) => {
      toast.success(t('admin.userEdit.profile.updated'));
      form.reset(values);
      return refreshUser();
    },
    onError: (error) => {
      toast.error(error.message || t('admin.userEdit.profile.failed'));
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.userEdit.profile.title')}</CardTitle>
        <CardDescription>
          {t('admin.userEdit.profile.description')}
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
                  <FormLabel>{t('admin.userEdit.profile.name')}</FormLabel>
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
                  <FormLabel>{t('admin.userEdit.profile.email')}</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} disabled={isPending} />
                  </FormControl>
                  <FormDescription>
                    {t('admin.userEdit.profile.emailHint')}
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
                {t('admin.userEdit.discard')}
              </Button>
              <SubmitButton
                isPending={isPending}
                disabled={!form.formState.isDirty}
              >
                {t('admin.userEdit.saveChanges')}
              </SubmitButton>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RoleForm({ user, isSelf }: { user: AdminUserDto; isSelf: boolean }) {
  const t = useT();
  const refreshUser = useRefreshUser(user.id);
  const [role, setRole] = useState<EditableRole>(
    user.role === 'admin' ? 'admin' : 'user',
  );

  const { mutate, isPending } = useMutation({
    mutationFn: (next: EditableRole) =>
      unwrap(authClient.admin.setRole({ userId: user.id, role: next })),
    onSuccess: () => {
      toast.success(t('admin.userEdit.role.updated'));
      return refreshUser();
    },
    onError: (error) => {
      toast.error(error.message || t('admin.userEdit.role.failed'));
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.userEdit.role.title')}</CardTitle>
        <CardDescription>
          {t('admin.userEdit.role.description')}
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
            <Label htmlFor="user-role">{t('admin.userEdit.role.platformRole')}</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as EditableRole)}
              disabled={isPending || isSelf}
            >
              <SelectTrigger id="user-role" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t('admin.userEdit.role.user')}</SelectItem>
                <SelectItem value="admin">{t('admin.userEdit.role.admin')}</SelectItem>
              </SelectContent>
            </Select>
            {isSelf && (
              <p className="text-xs text-muted-foreground">
                {t('admin.userEdit.role.cannotChangeSelf')}
              </p>
            )}
          </div>
          <SubmitButton
            isPending={isPending}
            disabled={isSelf || role === user.role}
          >
            {t('admin.userEdit.role.update')}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm({ user }: { user: AdminUserDto }) {
  const t = useT();
  const passwordSchema = useMemo(() => createPasswordSchema(t), [t]);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ newPassword }: PasswordValues) =>
      unwrap(
        authClient.admin.setUserPassword({ userId: user.id, newPassword }),
      ),
    onSuccess: () => {
      toast.success(t('admin.userEdit.password.updated'));
      form.reset();
    },
    onError: (error) => {
      toast.error(error.message || t('admin.userEdit.password.failed'));
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.userEdit.password.title')}</CardTitle>
        <CardDescription>
          {t('admin.userEdit.password.description')}
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
                    <FormLabel>{t('admin.userEdit.password.new')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder={t('admin.userEdit.password.placeholder')}
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
                    <FormLabel>{t('admin.userEdit.password.confirm')}</FormLabel>
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
                {t('admin.userEdit.password.set')}
              </SubmitButton>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function BanSection({ user, isSelf }: { user: AdminUserDto; isSelf: boolean }) {
  const t = useT();
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
      toast.success(user.banned ? t('admin.userEdit.ban.unbanned') : t('admin.userEdit.ban.banned'));
      setReason('');
      setDuration('permanent');
      return refreshUser();
    },
    onError: (error) => {
      toast.error(error.message || t('admin.userEdit.ban.failed'));
    },
  });

  return (
    <Card className="gap-4 border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{t('admin.userEdit.ban.dangerZone')}</CardTitle>
        <CardDescription>
          {user.banned
            ? t('admin.userEdit.ban.bannedDescription')
            : t('admin.userEdit.ban.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium">
            {user.banned ? t('admin.userEdit.ban.unbanUser') : t('admin.userEdit.ban.banUser')}
          </p>
          <p className="text-xs text-muted-foreground">
            {isSelf
              ? t('admin.userEdit.ban.cannotBanSelf')
              : user.banned
                ? t('admin.userEdit.ban.restoreHint')
                : t('admin.userEdit.ban.banHint')}
          </p>
        </div>
        <ConfirmDialog
          title={user.banned ? t('admin.userEdit.ban.unbanUser') : t('admin.userEdit.ban.banUser')}
          description={
            user.banned
              ? t('admin.userEdit.ban.confirmUnban', { name: user.name })
              : t('admin.userEdit.ban.confirmBan', { name: user.name })
          }
          onConfirm={() => mutate()}
          confirmText={user.banned ? t('admin.userEdit.ban.unban') : t('admin.userEdit.ban.ban')}
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
              {user.banned ? t('admin.userEdit.ban.unbanUser') : t('admin.userEdit.ban.banUser')}
            </Button>
          }
        >
          {!user.banned && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="ban-reason">{t('admin.userEdit.ban.reason')}</Label>
                <Input
                  id="ban-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('admin.userEdit.ban.reasonPlaceholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ban-duration">{t('admin.userEdit.ban.duration')}</Label>
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
                        {t(d.labelKey)}
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

/**
 * A public sign-up stays inactive until an admin approves (unbans) it. While
 * the mail server is on, it has to confirm its email first; the API enforces
 * that too.
 */
function ApprovalSection({ user }: { user: AdminUserDto }) {
  const t = useT();
  const refreshUser = useRefreshUser(user.id);
  const { data: settings } = useSystemConfigsControllerGetSettings();
  const awaitingEmail = !!settings?.mailServer?.enabled && !user.emailVerified;

  const { mutate, isPending } = useMutation({
    mutationFn: () => unwrap(authClient.admin.unbanUser({ userId: user.id })),
    onSuccess: () => {
      toast.success(t('admin.userEdit.approval.approved'));
      return refreshUser();
    },
    onError: (error) => {
      toast.error(error.message || t('admin.userEdit.approval.failed'));
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.userEdit.approval.title')}</CardTitle>
        <CardDescription>
          {t('admin.userEdit.approval.description', { name: user.name })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium">{t('admin.userEdit.approval.approveAccount')}</p>
          <p className="text-xs text-muted-foreground">
            {awaitingEmail
              ? t('admin.userEdit.approval.awaitingEmail')
              : t('admin.userEdit.approval.hint')}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={isPending || awaitingEmail}
          onClick={() => mutate()}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserCheck className="h-3.5 w-3.5" />
          )}
          {t('admin.userEdit.approval.approve')}
        </Button>
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
      {user.pendingApproval && <ApprovalSection user={user} />}
      <ProfileForm user={user} />
      <RoleForm user={user} isSelf={isSelf} />
      <PasswordForm user={user} />
      {!user.pendingApproval && <BanSection user={user} isSelf={isSelf} />}
    </div>
  );
}
