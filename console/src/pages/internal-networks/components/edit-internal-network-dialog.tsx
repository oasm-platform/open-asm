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
  useInternalNetworksControllerUpdateInternalNetworkById,
  type GetManyInternalNetworksResponseDtoDataItem,
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
});

interface EditInternalNetworkDialogProps {
  internalNetwork: GetManyInternalNetworksResponseDtoDataItem;
  onSuccess?: () => void;
}

export function EditInternalNetworkDialog({
  internalNetwork,
  onSuccess,
}: EditInternalNetworkDialogProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: internalNetwork.name as string,
    },
  });

  const { mutate } = useInternalNetworksControllerUpdateInternalNetworkById();

  const queryClient = useQueryClient();

  type FormValues = z.infer<typeof formSchema>;

  function handleSubmit(data: FormValues) {
    mutate(
      {
        id: internalNetwork.id as string,
        data,
      },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success('Internal network updated successfully');
          queryClient.invalidateQueries({ queryKey: ['internalNetworks'] });
          onSuccess?.();
        },
        onError: () => {
          toast.error('Failed to update internal network');
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
            <p>Edit internal network</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit internal network</DialogTitle>
            <DialogDescription>
              Update the name of your internal network.
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
                      <Input placeholder="Internal network name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}