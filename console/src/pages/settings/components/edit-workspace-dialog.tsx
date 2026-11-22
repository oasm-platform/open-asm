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
import { Textarea } from '@/components/ui/textarea';
import {
  useWorkspacesControllerUpdateWorkspace,
  type Workspace,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Edit } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT, type TFunction } from '@/lib/i18n-dictionary';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const makeFormSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, t('settings.workspace.nameRequired')),
    description: z.string().optional(),
  });
type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

interface EditWorkspaceDialogProps {
  workspace: Workspace;
}

export function EditWorkspaceDialog({ workspace }: EditWorkspaceDialogProps) {
  const t = useT();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: workspace.name,
      description: workspace.description || '',
    },
  });

  const { mutate } = useWorkspacesControllerUpdateWorkspace();

  const queryClient = useQueryClient();

  function handleSubmit(data: FormValues) {
    mutate(
      {
        id: workspace.id,
        data,
      },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success(t('settings.workspace.updated'));
          queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        },
        onError: () => {
          toast.error(t('settings.workspace.updateFailed'));
        },
      },
    );
  }

  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-muted-foreground/80"
        onClick={() => setOpen(true)}
      >
        <Edit className="h-4 w-4" />
        <span className="sr-only">{t('common.edit')}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-106.25">
          <DialogHeader>
            <DialogTitle>{t('settings.workspace.edit.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.workspace.edit.description')}
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
                      <Input placeholder={t('settings.workspace.namePlaceholder')} {...field} />
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
                      <Textarea
                        placeholder={t('settings.workspace.descriptionPlaceholder')}
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">{t('settings.workspace.saveChanges')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
