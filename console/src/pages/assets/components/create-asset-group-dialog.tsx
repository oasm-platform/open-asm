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
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useAssetGroupControllerCreate,
  type AssetGroup,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'Host group name is required'),
  hexColor: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateAssetGroupDialogProps {
  onSuccess?: () => void;
}

export function CreateAssetGroupDialog({
  onSuccess,
}: CreateAssetGroupDialogProps) {
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      hexColor: '',
    },
  });

  const navigate = useNavigate();
  const { mutate: createAssetGroup, isPending } =
    useAssetGroupControllerCreate();

  const onSubmit = (values: FormValues) => {
    if (!selectedWorkspaceId) {
      // Handle case where workspace is not selected
      console.error('No workspace selected');
      return;
    }
    createAssetGroup(
      {
        data: {
          name: values.name,
          hexColor: values.hexColor || undefined,
        },
      },
      {
        onSuccess: (response: AssetGroup) => {
          setCreateDialogOpen(false);
          onSuccess?.();
          navigate({ to: `/groups/${response.id}` });
          form.reset();
        },
      },
    );
  };

  return (
    <div>
      <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
        <Plus />
        Create
      </Button>
      <Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create host group</DialogTitle>
            <DialogDescription>
              Create a new host group to organize your hosts.
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
              <FormField
                control={form.control}
                name="hexColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className="flex space-x-2">
                        {[
                          '#78716C', // current/default
                          '#3b82f6', // blue
                          '#22c55e', // green
                          '#f59e0b', // yellow
                          '#7e22ce', // purple
                          '#ec4899', // pink
                        ].map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`w-8 h-8 rounded-full border-2 cursor-pointer ${
                              field.value === color
                                ? 'border-gray-400 ring-2 ring-offset-2 ring-blue-500'
                                : 'border-gray-300'
                            }`}
                            style={{ backgroundColor: color }}
                            onClick={() => field.onChange(color)}
                            aria-label={`Select ${color} color`}
                          />
                        ))}
                      </div>
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
