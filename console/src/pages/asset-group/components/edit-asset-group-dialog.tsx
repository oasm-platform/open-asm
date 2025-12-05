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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useAssetGroupControllerUpdateAssetGroupById,
  type AssetGroup,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Edit } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hexColor: z.string().optional(),
});

interface EditAssetGroupDialogProps {
  assetGroup: AssetGroup;
  onSuccess?: () => void;
}

export function EditAssetGroupDialog({
  assetGroup,
  onSuccess,
}: EditAssetGroupDialogProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: assetGroup.name,
      hexColor: assetGroup.hexColor || '',
    },
  });

  const { mutate } = useAssetGroupControllerUpdateAssetGroupById();

  const queryClient = useQueryClient();

  function handleSubmit(data: z.infer<typeof formSchema>) {
    mutate(
      {
        id: assetGroup.id,
        data,
      },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success('Asset group updated successfully');
          queryClient.invalidateQueries({ queryKey: ['asset-group'] });
          onSuccess?.();
        },
        onError: () => {
          toast.error('Failed to update asset group');
        },
      },
    );
  }

  const [open, setOpen] = useState(false);

  return (
    <div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-muted-foreground/80"
              onClick={() => setOpen(true)}
            >
              <Edit className="h-10 w-10" />
              <span className="sr-only">Edit</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edit asset group</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Asset Group</DialogTitle>
            <DialogDescription>
              Update the name and color of your asset group.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Asset group name" {...field} />
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
                      <div className="space-y-3">
                        <Input
                          className="hidden"
                          disabled
                          placeholder="#FF0000"
                          {...field}
                        />
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
                              className={`w-8 h-8 rounded-full border-2 ${
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
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
