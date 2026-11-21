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
import { t as translate, useT } from '@/lib/i18n-dictionary';
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

// Built per render so the validation message follows the current language.
const makeFormSchema = () =>
  z.object({
    name: z.string().min(1, translate('internalNetworks.edit.nameRequired')),
  });
type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

interface EditInternalNetworkDialogProps {
  internalNetwork: GetManyInternalNetworksResponseDtoDataItem;
  onSuccess?: () => void;
}

export function EditInternalNetworkDialog({
  internalNetwork,
  onSuccess,
}: EditInternalNetworkDialogProps) {
  const t = useT();
  const form = useForm<FormValues>({
    resolver: zodResolver(makeFormSchema()),
    defaultValues: {
      name: internalNetwork.name as string,
    },
  });

  const { mutate } = useInternalNetworksControllerUpdateInternalNetworkById();

  const queryClient = useQueryClient();

  function handleSubmit(data: FormValues) {
    mutate(
      {
        id: internalNetwork.id as string,
        data,
      },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success(translate('internalNetworks.edit.success'));
          queryClient.invalidateQueries({ queryKey: ['internalNetworks'] });
          onSuccess?.();
        },
        onError: () => {
          toast.error(translate('internalNetworks.edit.failed'));
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
              <span className="sr-only">{t('common.edit')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('internalNetworks.edit.title')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('internalNetworks.edit.title')}</DialogTitle>
            <DialogDescription>
              {t('internalNetworks.edit.description')}
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
                    <FormLabel>{t('common.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('internalNetworks.edit.namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">{t('common.save')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}