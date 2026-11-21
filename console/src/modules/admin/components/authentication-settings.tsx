import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  getRootControllerGetMetadataQueryKey,
  getSystemConfigsControllerGetSettingsQueryKey,
  useSystemConfigsControllerGetSettings,
  useSystemConfigsControllerUpdateSettings,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { AxiosError } from 'axios';
import { MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';

/**
 * Account settings (`settings.auth`). The switch saves at once, like the
 * workspace discovery settings.
 */
export default function AuthenticationSettings() {
  const t = useT();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSystemConfigsControllerGetSettings();
  const { mutate, isPending } = useSystemConfigsControllerUpdateSettings();

  const setAllowSignUp = (allowSignUp: boolean) =>
    mutate(
      { data: { auth: { allowSignUp } } },
      {
        onSuccess: () => {
          toast.success(
            allowSignUp
              ? t('admin.signUp.enabled')
              : t('admin.signUp.disabled'),
          );
          // Metadata carries `allowSignUp` for the sign-up button
          return Promise.all([
            queryClient.invalidateQueries({
              queryKey: getSystemConfigsControllerGetSettingsQueryKey(),
            }),
            queryClient.invalidateQueries({
              queryKey: getRootControllerGetMetadataQueryKey(),
            }),
          ]);
        },
        onError: (error) => {
          toast.error(
            (error as AxiosError<{ message?: string }>).response?.data
              ?.message ?? t('admin.signUp.failed'),
          );
        },
      },
    );

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.signUp.title')}</CardTitle>
        <CardDescription>{t('admin.signUp.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label
            htmlFor="allow-sign-up"
            className="flex flex-col items-start gap-1 cursor-pointer"
          >
            <span className="font-medium">{t('admin.signUp.allow')}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {t('admin.signUp.allowHint')}
            </span>
          </Label>
          {isLoading ? (
            <Skeleton className="h-[1.15rem] w-8 rounded-full" />
          ) : (
            <Switch
              id="allow-sign-up"
              checked={settings?.auth?.allowSignUp ?? false}
              disabled={isPending}
              onCheckedChange={setAllowSignUp}
            />
          )}
        </div>
        {settings && !settings.mailServer?.enabled && (
          <Alert>
            <MailWarning />
            <AlertDescription>
              <p>
                {t('admin.signUp.mailRequiredBefore')}{' '}
                <Link
                  to="/admin/mail-server"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t('admin.signUp.mailRequiredLink')}
                </Link>{' '}
                {t('admin.signUp.mailRequiredAfter')}
              </p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
