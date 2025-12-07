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
import {
  useAssetGroupControllerCreate,
  type AssetGroup,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'Asset group name is required'),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateAssetGroupDialogProps {
  onSuccess?: () => void;
}

export function CreateAssetGroupDialog({
  onSuccess,
}: CreateAssetGroupDialogProps) {
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const { selectedWorkspace } = useWorkspaceSelector();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  });

  const navigate = useNavigate();
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
        },
      },
      {
        onSuccess: (response: AssetGroup) => {
          setCreateDialogOpen(false);
          onSuccess?.();
          navigate(`/assets/groups/${response.id}`);
          form.reset();
        },
      },
    );
  };

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCreateDialogOpen(true)}
      >
        <Plus />
        Create
      </Button>
      <Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create asset group</DialogTitle>
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
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
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
    </div>
  );
}
