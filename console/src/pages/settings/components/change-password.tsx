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
import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT, type TFunction } from '@/lib/i18n-dictionary';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const makeFormSchema = (t: TFunction) =>
  z
    .object({
      currentPassword: z
        .string()
        .min(1, t('settings.password.errors.currentRequired')),
      newPassword: z
        .string()
        .min(8, t('settings.password.errors.newMin')),
      confirmPassword: z
        .string()
        .min(8, t('settings.password.errors.confirmMin')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('settings.password.errors.mismatch'),
      path: ['confirmPassword'],
    });
type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

export default function ChangePassword() {
  const t = useT();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const togglePasswordVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const res = await authClient.changePassword(values);
      if (!res.data) {
        form.setError('currentPassword', {
          message: t('settings.password.errors.incorrect'),
        });
      } else {
        toast.success(t('settings.password.changed'));
        form.reset();
        setShowPasswords({ current: false, new: false, confirm: false });
      }
    } catch {
      form.setError('currentPassword', {
        message: t('settings.password.errors.failed'),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4">
      <CardTitle>{t('settings.password.title')}</CardTitle>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.password.current')}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPasswords.current ? 'text' : 'password'}
                      placeholder={t('settings.password.currentPlaceholder')}
                      {...field}
                      disabled={loading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => togglePasswordVisibility('current')}
                      disabled={loading}
                    >
                      {showPasswords.current ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.password.new')}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPasswords.new ? 'text' : 'password'}
                      placeholder={t('settings.password.newPlaceholder')}
                      {...field}
                      disabled={loading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => togglePasswordVisibility('new')}
                      disabled={loading}
                    >
                      {showPasswords.new ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
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
                <FormLabel>{t('settings.password.confirm')}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      placeholder={t('settings.password.confirm')}
                      {...field}
                      disabled={loading}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => togglePasswordVisibility('confirm')}
                      disabled={loading}
                    >
                      {showPasswords.confirm ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
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
              {t('settings.password.submit')}
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}
