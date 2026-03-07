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
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerDeleteWorkspace,
  useWorkspacesControllerUpdateWorkspace,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.union([z.string(), z.undefined()]),
});

/**
 * Workspace settings component displaying workspace info, edit form, and danger zone.
 */
export default function WorkspaceSettings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { selectedWorkspace, workspaces, refetch } = useWorkspaceSelector();

  const currentWorkspace = workspaces.find((ws) => ws.id === selectedWorkspace);

  const form = useForm<z.infer<typeof formSchema>>({
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

  function handleUpdate(data: z.infer<typeof formSchema>) {
    if (!currentWorkspace) return;

    updateWorkspace(
      {
        id: currentWorkspace.id,
        data,
      },
      {
        onSuccess: () => {
          toast.success('Workspace updated successfully');
          queryClient.invalidateQueries({ queryKey: ['workspaces'] });
          refetch();
        },
        onError: () => {
          toast.error('Failed to update workspace');
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
          toast.success('Workspace deleted successfully');
          queryClient.invalidateQueries({ queryKey: ['workspaces'] });
          navigate('/');
        },
        onError: () => {
          toast.error('Failed to delete workspace');
        },
      },
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-10">
            <p className="text-center text-muted-foreground">
              No workspace selected. Please select a workspace to manage its
              settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workspace Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Information</CardTitle>
          <CardDescription>
            Manage your workspace name and description
          </CardDescription>
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
                    <FormLabel>Workspace Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Workspace name" {...field} />
                    </FormControl>
                    <FormDescription>
                      This is the display name of your workspace
                    </FormDescription>
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
                      <Input placeholder="Workspace description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-[0.5px] border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for this workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-destructive">
            <div>
              <p className="font-medium">Delete Workspace</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete this workspace and all its data
              </p>
            </div>
            <ConfirmDialog
              title="Delete workspace"
              description={`Are you sure you want to delete "${currentWorkspace.name}"? All related data including assets, vulnerabilities, scan results, and settings will be permanently deleted and cannot be recovered.`}
              onConfirm={handleDelete}
              confirmText="Delete"
              typeToConfirm="delete"
              disabled={isDeleting}
              trigger={
                <Button variant="outline" disabled={isDeleting}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
