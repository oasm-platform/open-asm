import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authClient } from '@/utils/authClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT, type TFunction } from '@/lib/i18n-dictionary';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const makeFormSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, t('settings.workspace.nameRequired')),
  });
type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

export default function UpdateUser() {
  const t = useT();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const { data } = authClient.useSession();

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: data?.user.name ?? '',
    },
  });

  const [loading, setLoading] = useState(false);

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const res = await authClient.updateUser({ ...values, image: '' });
      if (!res.data) {
        form.setError('name', { message: t('settings.profile.invalidName') });
      } else {
        toast.success(t('settings.profile.updated'));
        form.reset({ name: values.name });
      }
    } catch {
      form.setError('name', { message: t('settings.profile.updateFailed') });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4">
      <CardTitle>{t('settings.profile.title')}</CardTitle>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('common.name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('settings.profile.namePlaceholder')}
                    {...field}
                    className="w-full"
                    disabled={loading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <Button
              disabled={loading || !form.formState.isDirty}
              type="submit"
              size="sm"
            >
              {loading && <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}
