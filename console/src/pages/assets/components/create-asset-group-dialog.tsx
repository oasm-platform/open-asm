import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useAssetGroupControllerCreate } from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'Asset group name is required'),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateAssetGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateAssetGroupDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateAssetGroupDialogProps) {
  const { selectedWorkspace } = useWorkspaceSelector();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  });

  const { mutate: createAssetGroup, isPending } =
    useAssetGroupControllerCreate();

  const onSubmit = (values: FormValues) => {
    if (!selectedWorkspace) {
      // Handle case where workspace is not selected
      console.error('No workspace selected');
      return;
    }
    createAssetGroup(
      {
        data: {
          name: values.name,
          workspaceId: selectedWorkspace,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
          form.reset();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Asset Group</DialogTitle>
          <DialogDescription>
            Create a new asset group to organize your assets.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asset Group Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Critical Web Servers"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
