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
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { usePermission } from '@/hooks/usePermission';
import {
  useWorkspacesControllerDeleteWorkspace,
  useWorkspacesControllerUpdateWorkspace,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { WorkspaceConfigs } from './workspace-configs';
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useT, type TFunction } from '@/lib/i18n-dictionary';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';

const makeFormSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, t('settings.workspace.nameRequired')),
    description: z.union([z.string(), z.undefined()]),
  });
type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

/**
 * Workspace settings component displaying workspace info, edit form, and danger zone.
 */
export default function WorkspaceSettings() {
  const t = useT();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { selectedWorkspace, workspaces, refetch } = useWorkspaceSelector();
  const { hasPermission, isLoading: permissionsLoading } = usePermission();

  const currentWorkspace = workspaces.find((ws) => ws.id === selectedWorkspace);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // Populate form when workspace data is loaded
  useEffect(() => {
    if (currentWorkspace) {
      const desc = currentWorkspace.description;
      // Handle both string and complex types
      const descValue = typeof desc === 'string' ? desc : '';
      form.reset({
        name: currentWorkspace.name,
        description: descValue,
      });
    }
  }, [currentWorkspace, form]);

  const { mutate: updateWorkspace, isPending: isUpdating } =
    useWorkspacesControllerUpdateWorkspace();

  const { mutate: deleteWorkspace, isPending: isDeleting } =
    useWorkspacesControllerDeleteWorkspace();

  function handleUpdate(data: FormValues) {
    if (!currentWorkspace) return;

    updateWorkspace(
      {
        id: currentWorkspace.id,
        data,
      },
      {
        onSuccess: () => {
          toast.success(t('settings.workspace.updated'));
          queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
          refetch();
        },
        onError: () => {
          toast.error(t('settings.workspace.updateFailed'));
        },
      },
    );
  }

  function handleDelete() {
    if (!currentWorkspace) return;

    deleteWorkspace(
      {
        id: currentWorkspace.id,
      },
      {
        onSuccess: () => {
          toast.success(t('settings.workspace.deleted'));
          queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
          navigate({ to: '/' });
        },
        onError: () => {
          toast.error(t('settings.workspace.deleteFailed'));
        },
      },
    );
  }

  if (permissionsLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('settings.workspace.loadingPermissions')}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-10">
            <p className="text-center text-muted-foreground">
              {t('settings.workspace.noWorkspace')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workspace Information Card */}
      {hasPermission('workspace.write') && (
        <Card>
        <CardHeader>
          <CardTitle>{t('settings.workspace.information')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleUpdate)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>{t('common.description')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? t('settings.members.saving') : t('common.save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      )}

      {/* Configs */}
      {hasPermission('workspace.config') && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.workspace.configs')}</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkspaceConfigs />
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      {hasPermission('workspace.delete') && (
        <Card className="border-[0.5px] border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">{t('settings.workspace.danger.title')}</CardTitle>
          <CardDescription>
            {t('settings.workspace.danger.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-destructive">
            <div>
              <p className="font-medium">{t('settings.workspace.danger.deleteTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {t('settings.workspace.danger.deleteDescription')}
              </p>
            </div>
            <ConfirmDialog
              title={t('settings.workspace.delete.title')}
              description={t('settings.workspace.delete.description', {
                name: currentWorkspace.name,
              })}
              onConfirm={handleDelete}
              confirmText={t('common.delete')}
              typeToConfirm="delete"
              disabled={isDeleting}
              trigger={
                <Button variant="outline" disabled={isDeleting}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeleting ? t('settings.workspace.deleting') : t('common.delete')}
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
