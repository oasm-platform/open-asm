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

const generalSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().trim(),
});

const DISCOVERY_SETTINGS = [
  {
    key: 'isAssetsDiscovery',
    title: 'Asset discovery',
    description:
      'Automatically scan and detect internet-facing assets (domains, IPs) in workspace networks',
  },
  {
    key: 'isAutoEnableAssetAfterDiscovered',
    title: 'Auto enable assets',
    description:
      'Newly discovered assets become active immediately without manual review',
  },
] as const;

const errorMessage = (error: unknown, fallback: string) =>
  (error as AxiosError<{ message?: string }>).response?.data?.message ??
  fallback;

/** Update the workspace, then refresh its page and the workspaces table. */
function useUpdateWorkspace(workspaceId: string) {
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
          toast.error(errorMessage(error, 'Failed to update workspace.'));
        },
      },
    );

  return { update, isPending };
}

function GeneralForm({ workspace }: { workspace: AdminWorkspaceDto }) {
  const { update, isPending } = useUpdateWorkspace(workspace.id);
  const form = useForm<z.infer<typeof generalSchema>>({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      name: workspace.name,
      description: workspace.description ?? '',
    },
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          The name and description members see for this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) =>
              update(values, {
                success: 'Workspace updated.',
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Optional"
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
                Discard
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !form.formState.isDirty}
                className="gap-1.5"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
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
  const { update, isPending } = useUpdateWorkspace(workspace.id);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Asset discovery</CardTitle>
        <CardDescription>
          How this workspace finds and enables new assets.
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
              <span className="font-medium">{setting.title}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {setting.description}
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
                    success: `${setting.title} ${checked ? 'enabled' : 'disabled'}.`,
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
  const queryClient = useQueryClient();
  const isArchived = !!workspace.archivedAt;
  const { mutate, isPending } = useAdminWorkspacesControllerSetArchived({
    mutation: {
      onSuccess: () => {
        toast.success(
          isArchived ? 'Workspace restored.' : 'Workspace archived.',
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
        toast.error(errorMessage(error, 'Failed to change workspace status.'));
      },
    },
  });

  return (
    <Card className="gap-4 border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          {isArchived
            ? 'This workspace is archived and hidden from its members.'
            : 'Archiving deactivates the workspace. Its data is kept.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium">
            {isArchived ? 'Restore workspace' : 'Archive workspace'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isArchived
              ? 'Members see it in their workspace list again.'
              : "Members no longer see it in their workspace list. Scheduled scans aren't stopped."}
          </p>
        </div>
        <ConfirmDialog
          title={isArchived ? 'Restore workspace' : 'Archive workspace'}
          description={
            isArchived
              ? `Restore "${workspace.name}"? Members will see it again.`
              : `Archive "${workspace.name}"? Members will no longer see it in their workspace list.`
          }
          onConfirm={() =>
            mutate({ id: workspace.id, data: { isArchived: !isArchived } })
          }
          confirmText={isArchived ? 'Restore' : 'Archive'}
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
              {isArchived ? 'Restore workspace' : 'Archive workspace'}
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
