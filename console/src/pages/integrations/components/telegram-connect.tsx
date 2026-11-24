import { t as translate, useT } from '@/lib/i18n-dictionary';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { OpenLink } from '@/components/ui/open-link';
import { Skeleton } from '@/components/ui/skeleton';
import { axiosInstance } from '@/services/apis/axios-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ExternalLink,
  Loader2,
  Plug,
  QrCode,
  Smartphone,
  Unplug,
  User,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────

interface TelegramConnectDto {
  id: string;
  telegramChatId?: string;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  connectToken: string;
  tokenExpiredAt?: string;
  status: string;
  isActive: boolean;
  botUsername?: string;
  integrationId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatUserNameShort(c: TelegramConnectDto) {
  if (c.telegramUsername) return `@${c.telegramUsername}`;
  if (c.telegramFirstName) {
    return [c.telegramFirstName, c.telegramLastName].filter(Boolean).join(' ');
  }
  return c.telegramChatId?.slice(0, 12) ?? translate('common.unknown');
}

// ─── Pairing Dialog ───────────────────────────────────────────────

interface PairingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  botUsername?: string;
}

function PairingDialog({
  open,
  onOpenChange,
  integrationId,
  botUsername,
}: PairingDialogProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [fetchedBotUsername, setFetchedBotUsername] = useState<string | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const effectiveBotUsername = botUsername ?? fetchedBotUsername;

  const pairingMutation = useMutation({
    mutationFn: (force: boolean) =>
      axiosInstance.post<TelegramConnectDto>(
        force
          ? `/api/integrations/${integrationId}/telegram/pairing?force=true`
          : `/api/integrations/${integrationId}/telegram/pairing`,
      ),
    onSuccess: (data) => {
      const dto = data as unknown as TelegramConnectDto;
      setPairingToken(dto.connectToken);
      if (dto.botUsername) setFetchedBotUsername(dto.botUsername);
      setTimeout(
        () =>
          queryClient.invalidateQueries({
            queryKey: ['telegram-connects', integrationId],
          }),
        2000,
      );
    },
    onError: () => {
      toast.error(t('integrations.telegram.pairingFailed'));
    },
  });

  const handleGenerate = () => {
    setPairingToken(null);
    pairingMutation.mutate(true); // force=true
  };

  // Auto-fetch existing token when dialog opens
  useEffect(() => {
    if (open) {
      setPairingToken(null);
      setConnected(false);
      pairingMutation.mutate(false); // force=false → reuse if valid
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll /connects every 1s to detect when the token transitions to CONNECTED
  useEffect(() => {
    if (!open || !pairingToken || connected) return;

    const checkConnection = async () => {
      try {
        const data = await axiosInstance.get<TelegramConnectDto[]>(
          `/api/integrations/${integrationId}/telegram/connects`,
        );
        const connects = Array.isArray(data) ? data : [];
        const matched = connects.find(
          (c) => c.connectToken === pairingToken && c.status === 'CONNECTED',
        );
        if (matched) {
          setConnected(true);
          queryClient.invalidateQueries({
            queryKey: ['telegram-connects', integrationId],
          });
        }
      } catch {
        // polling errors are ignored
      }
    };

    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, [open, pairingToken, connected, integrationId, queryClient]);

  const deepLink =
    pairingToken && effectiveBotUsername
      ? `https://t.me/${effectiveBotUsername}?start=${pairingToken}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('integrations.telegram.pairTitle')}</DialogTitle>
          <DialogDescription>
            {t('integrations.telegram.pairDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {!pairingToken && !pairingMutation.isPending && (
            <div className="flex flex-col items-center gap-2 text-center">
              <Smartphone className="size-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t('integrations.telegram.generateHint')}
              </p>
              <Button
                type="button"
                onClick={handleGenerate}
                className="mt-2 gap-2"
              >
                <QrCode className="size-4" />
                {t('integrations.telegram.generate')}
              </Button>
            </div>
          )}

          {pairingMutation.isPending && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {t('integrations.telegram.generating')}
              </p>
            </div>
          )}

          {pairingToken && (
            <>
              {connected ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <div className="flex size-24 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <Check className="size-12 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="mt-2 text-lg font-semibold text-green-600 dark:text-green-400">
                    {t('integrations.telegram.connectedTitle')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('integrations.telegram.pairedSuccess')}
                  </p>
                </div>
              ) : deepLink ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <QRCodeSVG
                      value={deepLink}
                      size={200}
                      level="M"
                      includeMargin
                    />
                  </div>
                  <Button asChild variant="default" className="gap-2">
                    <OpenLink
                      href={deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      {t('integrations.telegram.open')}
                    </OpenLink>
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {t('integrations.telegram.scanHint')}
                  </p>
                </div>
              ) : (
                <div className="flex w-full flex-col items-center gap-3">
                  <p className="text-xs text-muted-foreground">
                    {t('integrations.telegram.manualHint')}
                  </p>
                  <code className="rounded-md bg-muted px-4 py-2 font-mono text-sm">
                    /start {pairingToken}
                  </code>
                </div>
              )}

              {!connected && (
                <p className="text-xs text-muted-foreground">
                  {t('integrations.telegram.expires')}
                </p>
              )}

              {connected ? (
                <Button
                  type="button"
                  variant="default"
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                >
                  {t('integrations.telegram.done')}
                </Button>
              ) : (
                <div className="flex w-full gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleGenerate}
                    disabled={pairingMutation.isPending}
                  >
                    {pairingMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    {t('integrations.telegram.generateNew')}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                  >
                    {t('integrations.telegram.done')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────

interface TelegramConnectProps {
  integrationId: string;
  botUsername?: string;
}

export function TelegramConnect({
  integrationId,
  botUsername,
}: TelegramConnectProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const connectsQuery = useQuery({
    queryKey: ['telegram-connects', integrationId],
    queryFn: () =>
      axiosInstance.get<TelegramConnectDto[]>(
        `/api/integrations/${integrationId}/telegram/connects`,
      ),
    refetchInterval: 15_000,
  });

  const disconnectMutation = useMutation({
    mutationFn: (connectId: string) =>
      axiosInstance.delete(
        `/api/integrations/${integrationId}/telegram/connects/${connectId}`,
      ),
    onSuccess: () => {
      toast.success(t('integrations.telegram.disconnected'));
      queryClient.invalidateQueries({
        queryKey: ['telegram-connects', integrationId],
      });
    },
    onError: () => {
      toast.error(t('integrations.telegram.disconnectFailed'));
    },
  });

  const connects = Array.isArray(connectsQuery.data) ? connectsQuery.data : [];
  const activeConnects = connects.filter((c) => c.status === 'CONNECTED');

  return (
    <>
      <Card className="border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">
                {t('integrations.telegram.cardTitle')}
              </CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Plug className="size-3.5" />
              {t('integrations.telegram.pair')}
            </Button>
          </div>
          <CardDescription className="text-xs">
            {t('integrations.telegram.cardDescription')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Loading */}
          {connectsQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {/* Active connects */}
          {!connectsQuery.isLoading && activeConnects.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {t('integrations.telegram.connected')}
              </p>
              <div className="space-y-1">
                {activeConnects.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <User className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">
                        {formatUserNameShort(c)}
                      </span>
                      {c.telegramChatId && (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          ({c.telegramChatId})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="hidden text-xs text-green-600 dark:text-green-400 sm:inline">
                        {t('integrations.telegram.connected')}
                      </span>
                      <ConfirmDialog
                        title={t('integrations.disconnect.action')}
                        description={t('integrations.telegram.disconnectConfirm', {
                          name: formatUserNameShort(c),
                        })}
                        confirmText={t('integrations.disconnect.action')}
                        onConfirm={() => disconnectMutation.mutate(c.id)}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={disconnectMutation.isPending}
                            aria-label={t('integrations.telegram.disconnectLabel', {
                              name: formatUserNameShort(c),
                            })}
                          >
                            <Unplug className="size-3.5 text-destructive" />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!connectsQuery.isLoading && !connectsQuery.isError && activeConnects.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-6">
              <Smartphone className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t('integrations.telegram.empty')}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {t('integrations.telegram.emptyHint')}
              </p>
            </div>
          )}

          {/* Error state */}
          {connectsQuery.isError && (
            <p className="text-xs text-destructive">
              {t('integrations.telegram.loadFailed')}{' '}
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: ['telegram-connects', integrationId],
                  })
                }
              >
                {t('common.retry')}
              </Button>
            </p>
          )}
        </CardContent>
      </Card>

      <PairingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        integrationId={integrationId}
        botUsername={botUsername}
      />
    </>
  );
}
