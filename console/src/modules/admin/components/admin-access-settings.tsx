import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  getSystemConfigsControllerGetSettingsQueryKey,
  useSystemConfigsControllerGetSettings,
  useSystemConfigsControllerUpdateSettings,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';

/** One entry per line or comma; blanks dropped. The server validates each. */
const parseAllowedIps = (text: string) =>
  text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/**
 * Admin IP allow-list (`settings.adminAccess.allowedIps`). Empty allows every
 * IP. The server refuses a list that leaves out the admin saving it.
 */
export default function AdminAccessSettings() {
  const t = useT();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSystemConfigsControllerGetSettings();
  const { mutate, isPending } = useSystemConfigsControllerUpdateSettings();
  const savedIps = settings?.adminAccess?.allowedIps ?? [];
  // Unsaved edits; null shows the saved list
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? savedIps.join('\n');

  const save = () => {
    const allowedIps = parseAllowedIps(text);
    mutate(
      { data: { adminAccess: { allowedIps } } },
      {
        onSuccess: () => {
          toast.success(
            allowedIps.length
              ? t('admin.adminAccess.savedLimited')
              : t('admin.adminAccess.savedAll'),
          );
          setDraft(null);
          return queryClient.invalidateQueries({
            queryKey: getSystemConfigsControllerGetSettingsQueryKey(),
          });
        },
        onError: (error) => {
          toast.error(
            (error as AxiosError<{ message?: string | string[] }>).response
              ?.data?.message?.toString() ?? t('admin.adminAccess.saveFailed'),
          );
        },
      },
    );
  };

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.adminAccess.title')}</CardTitle>
        <CardDescription>
          {t('admin.adminAccess.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="admin-allowed-ips">{t('admin.adminAccess.allowedIps')}</Label>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Textarea
            id="admin-allowed-ips"
            className="min-h-24 font-mono text-sm"
            placeholder={'203.0.113.7\n10.0.0.0/8'}
            value={text}
            disabled={isPending}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <p className="text-sm text-muted-foreground">
          {t('admin.adminAccess.hint')}
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={save} disabled={isLoading || isPending || draft === null}>
          {isPending && <Loader2 className="animate-spin" />}
          {t('common.save')}
        </Button>
      </CardFooter>
    </Card>
  );
}
