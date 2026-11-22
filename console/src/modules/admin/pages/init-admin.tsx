import AuthLayout from '@/components/common/layout/auth-layout';
import { Button } from '@/components/ui/button';
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
  getRootControllerGetMetadataQueryKey,
  useAdminControllerCreateFirstAdmin,
  type CreateFirstAdminDto,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { type TFunction, useT } from '@/lib/i18n-dictionary';

const createFormSchema = (t: TFunction) =>
  z
  .object({
    email: z.string().email(t('admin.initAdmin.invalidEmail')),
    password: z.string().min(8, t('admin.initAdmin.passwordMin')),
    confirmPassword: z
      .string()
      .min(8, t('admin.initAdmin.confirmPasswordMin')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: t('admin.initAdmin.passwordMismatch'),
    path: ['confirmPassword'],
  });

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

export default function InitAdmin() {
  const tr = useT();
  const formSchema = useMemo(() => createFormSchema(tr), [tr]);
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const { mutate } = useAdminControllerCreateFirstAdmin();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function onSubmit(values: FormValues) {
    setLoading(true);
    mutate(
      { data: values as CreateFirstAdminDto },
      {
        onSuccess: async () => {
          queryClient.removeQueries({
            queryKey: getRootControllerGetMetadataQueryKey(),
          });
          await navigate({ to: '/login' });
        },
        onError: () => {
          form.setError('email', { message: tr('admin.initAdmin.invalidCredentials') });
        },
        onSettled: () => {
          setLoading(false);
        },
      },
    );
  }

  return (
    <AuthLayout>
      <div className="flex w-full items-center justify-center bg-background px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-balance text-2xl font-semibold tracking-tight">
              {tr('admin.initAdmin.title')}
            </h1>
            <p className="text-pretty text-sm text-muted-foreground">
              {tr('admin.initAdmin.subtitle')}
            </p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tr('admin.initAdmin.email')}</FormLabel>
                    <FormControl>
                      <Input placeholder="email@example.com" {...field} />
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
                    <FormLabel>{tr('admin.initAdmin.password')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tr('admin.initAdmin.confirmPassword')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                disabled={loading}
                type="submit"
                className="w-full"
                size="lg"
              >
                {loading && <Loader2Icon className="animate-spin" />}
                {tr('admin.initAdmin.submit')}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </AuthLayout>
  );
}
