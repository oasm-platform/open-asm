import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getAdminUsersControllerGetUsersQueryKey } from '@/services/apis/gen/queries';
import { authClient } from '@/utils/authClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { type TFunction, useT } from '@/lib/i18n-dictionary';

const createFormSchema = (t: TFunction) =>
  z.object({
  name: z.string().min(1, t('admin.addUser.nameRequired')),
  email: z.string().min(1, t('admin.addUser.emailRequired'))
      .email(t('admin.addUser.invalidEmail')),
  password: z.string().min(8, t('admin.addUser.passwordMin')),
  role: z.enum(['user', 'admin']),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

export function AddUserDialog() {
  const t = useT();
  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'user',
    },
  });

  const { mutate: createUser, isPending } = useMutation({
    mutationFn: (values: FormValues) =>
      authClient.admin.createUser({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
      }),
    onSuccess: () => {
      toast.success(t('admin.addUser.created'));
      setOpen(false);
      form.reset();
      return queryClient.invalidateQueries({
        queryKey: getAdminUsersControllerGetUsersQueryKey(),
      });
    },
    onError: () => {
      toast.error(t('admin.addUser.createFailed'));
    },
  });

  function onSubmit(values: FormValues) {
    createUser(values);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset();
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <UserPlus className="shrink-0" />
          <span>{t('common.add')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.addUser.title')}</DialogTitle>
          <DialogDescription>
            {t('admin.addUser.description')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="add-user-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.addUser.name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Jane Smith"
                      {...field}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.addUser.email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="jane@example.com"
                      {...field}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.addUser.password')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t('admin.addUser.passwordPlaceholder')}
                      {...field}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.addUser.role')}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('admin.addUser.rolePlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="user">
                        {t('admin.addUser.roleUser')}
                      </SelectItem>
                      <SelectItem value="admin">
                        {t('admin.addUser.roleAdmin')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="add-user-form"
            disabled={isPending}
            className="gap-1.5"
          >
            {isPending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {t('admin.addUser.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
