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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  getAdminWorkspacesControllerGetWorkspaceQueryKey,
  getAdminWorkspacesControllerGetWorkspacesQueryKey,
  useAdminWorkspacesControllerSetArchived,
  useAdminWorkspacesControllerUpdateWorkspace,
  type AdminWorkspaceDto,
  type UpdateAdminWorkspaceDto,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useMemo } from 'react';
import { type TFunction, useT } from '@/lib/i18n-dictionary';

const createGeneralSchema = (t: TFunction) =>
  z.object({
    name: z.string().trim().min(1, t('admin.workspaceEdit.nameRequired')),
    description: z.string().trim(),
  });

type GeneralValues = z.infer<ReturnType<typeof createGeneralSchema>>;

const DISCOVERY_SETTINGS = [
  {
    key: 'isAssetsDiscovery',
    titleKey: 'admin.workspaceEdit.discovery.assets.title',
    descriptionKey: 'admin.workspaceEdit.discovery.assets.description',
  },
  {
    key: 'isAutoEnableAssetAfterDiscovered',
    titleKey: 'admin.workspaceEdit.discovery.autoEnable.title',
    descriptionKey: 'admin.workspaceEdit.discovery.autoEnable.description',
  },
] as const;

const errorMessage = (error: unknown, fallback: string) =>
  (error as AxiosError<{ message?: string }>).response?.data?.message ??
  fallback;

/** Update the workspace, then refresh its page and the workspaces table. */
function useUpdateWorkspace(workspaceId: string) {
  const t = useT();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useAdminWorkspacesControllerUpdateWorkspace();

  const update = (
    data: UpdateAdminWorkspaceDto,
    { success, onSuccess }: { success: string; onSuccess?: () => void },
  ) =>
    mutate(
      { id: workspaceId, data },
      {
        onSuccess: () => {
          toast.success(success);
          onSuccess?.();
          return Promise.all([
            queryClient.invalidateQueries({
              queryKey: getAdminWorkspacesControllerGetWorkspaceQueryKey(
                workspaceId,
              ),
            }),
            queryClient.invalidateQueries({
              queryKey: getAdminWorkspacesControllerGetWorkspacesQueryKey(),
            }),
          ]);
        },
        onError: (error) => {
          toast.error(errorMessage(error, t('admin.workspaceEdit.updateFailed')));
        },
      },
    );

  return { update, isPending };
}

function GeneralForm({ workspace }: { workspace: AdminWorkspaceDto }) {
  const t = useT();
  const generalSchema = useMemo(() => createGeneralSchema(t), [t]);
  const { update, isPending } = useUpdateWorkspace(workspace.id);
  const form = useForm<GeneralValues>({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      name: workspace.name,
      description: workspace.description ?? '',
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.workspaceEdit.general.title')}</CardTitle>
        <CardDescription>
          {t('admin.workspaceEdit.general.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) =>
              update(values, {
                success: t('admin.workspaceEdit.updated'),
                onSuccess: () => form.reset(values),
              }),
            )}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.workspaceEdit.name')}</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.workspaceEdit.description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder={t('admin.workspaceEdit.optional')}
                      {...field}
                      disabled={isPending}
                    />
                  </FormControl>
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
                {t('admin.workspaceEdit.discard')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !form.formState.isDirty}
                className="gap-1.5"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('admin.workspaceEdit.saveChanges')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

/** Same behaviour as the workspace's own settings: each switch saves at once. */
function DiscoverySettings({ workspace }: { workspace: AdminWorkspaceDto }) {
  const t = useT();
  const { update, isPending } = useUpdateWorkspace(workspace.id);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.workspaceEdit.discovery.title')}</CardTitle>
        <CardDescription>
          {t('admin.workspaceEdit.discovery.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {DISCOVERY_SETTINGS.map((setting) => (
          <div
            key={setting.key}
            className="flex items-center justify-between gap-4"
          >
            <Label
              htmlFor={setting.key}
              className="flex flex-col items-start gap-1 cursor-pointer"
            >
              <span className="font-medium">{t(setting.titleKey)}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {t(setting.descriptionKey)}
              </span>
            </Label>
            <Switch
              id={setting.key}
              checked={workspace[setting.key]}
              disabled={isPending}
              onCheckedChange={(checked) =>
                update(
                  { [setting.key]: checked },
                  {
                    success: t(
                      checked
                        ? 'admin.workspaceEdit.discovery.enabled'
                        : 'admin.workspaceEdit.discovery.disabled',
                      { setting: t(setting.titleKey) },
                    ),
                  },
                )
              }
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ArchiveSection({ workspace }: { workspace: AdminWorkspaceDto }) {
  const t = useT();
  const queryClient = useQueryClient();
  const isArchived = !!workspace.archivedAt;
  const { mutate, isPending } = useAdminWorkspacesControllerSetArchived({
    mutation: {
      onSuccess: () => {
        toast.success(
          isArchived ? t('admin.workspaceEdit.archive.restored') : t('admin.workspaceEdit.archive.archived'),
        );
        return Promise.all([
          queryClient.invalidateQueries({
            queryKey: getAdminWorkspacesControllerGetWorkspaceQueryKey(
              workspace.id,
            ),
          }),
          queryClient.invalidateQueries({
            queryKey: getAdminWorkspacesControllerGetWorkspacesQueryKey(),
          }),
        ]);
      },
      onError: (error) => {
        toast.error(errorMessage(error, t('admin.workspaceEdit.archive.failed')));
      },
    },
  });

  return (
    <Card className="gap-4 border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{t('admin.workspaceEdit.archive.dangerZone')}</CardTitle>
        <CardDescription>
          {isArchived
            ? t('admin.workspaceEdit.archive.archivedDescription')
            : t('admin.workspaceEdit.archive.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium">
            {isArchived
              ? t('admin.workspaceEdit.archive.restoreWorkspace')
              : t('admin.workspaceEdit.archive.archiveWorkspace')}
          </p>
          <p className="text-xs text-muted-foreground">
            {isArchived
              ? t('admin.workspaceEdit.archive.restoreHint')
              : t('admin.workspaceEdit.archive.archiveHint')}
          </p>
        </div>
        <ConfirmDialog
          title={isArchived
              ? t('admin.workspaceEdit.archive.restoreWorkspace')
              : t('admin.workspaceEdit.archive.archiveWorkspace')}
          description={
            isArchived
              ? t('admin.workspaceEdit.archive.confirmRestore', { name: workspace.name })
              : t('admin.workspaceEdit.archive.confirmArchive', { name: workspace.name })
          }
          onConfirm={() =>
            mutate({ id: workspace.id, data: { isArchived: !isArchived } })
          }
          confirmText={isArchived ? t('admin.workspaceEdit.archive.restore') : t('admin.workspaceEdit.archive.archive')}
          trigger={
            <Button
              variant={isArchived ? 'outline' : 'destructive'}
              size="sm"
              className="gap-1.5"
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isArchived ? (
                <ArchiveRestore className="h-3.5 w-3.5" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              {isArchived
              ? t('admin.workspaceEdit.archive.restoreWorkspace')
              : t('admin.workspaceEdit.archive.archiveWorkspace')}
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

/** Admin-editable settings of a workspace, one card per concern. */
export function WorkspaceEdit({ workspace }: { workspace: AdminWorkspaceDto }) {
  return (
    <div className="space-y-4">
      <GeneralForm workspace={workspace} />
      <DiscoverySettings workspace={workspace} />
      <ArchiveSection workspace={workspace} />
    </div>
  );
}
