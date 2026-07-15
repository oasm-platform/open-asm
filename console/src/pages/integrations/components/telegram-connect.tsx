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
  return c.telegramChatId?.slice(0, 12) ?? 'Unknown';
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
      toast.error('Failed to create pairing token');
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
          <DialogTitle>Pair Telegram Device</DialogTitle>
          <DialogDescription>
            Generate a token, then send it to your Telegram bot via /start
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {!pairingToken && !pairingMutation.isPending && (
            <div className="flex flex-col items-center gap-2 text-center">
              <Smartphone className="size-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Click the button below to generate a new pairing token.
              </p>
              <Button onClick={handleGenerate} className="mt-2 gap-2">
                <QrCode className="size-4" />
                Generate Pairing Token
              </Button>
            </div>
          )}

          {pairingMutation.isPending && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Generating token...
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
                    Connected!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your Telegram paired successfully.
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
                    <a
                      href={deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      Open Telegram
                    </a>
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Scan QR with your phone, or click the button to open
                    Telegram
                  </p>
                </div>
              ) : (
                <div className="flex w-full flex-col items-center gap-3">
                  <p className="text-xs text-muted-foreground">
                    Open Telegram, find your bot, and send:
                  </p>
                  <code className="rounded-md bg-muted px-4 py-2 font-mono text-sm">
                    /start {pairingToken}
                  </code>
                </div>
              )}

              {!connected && (
                <p className="text-xs text-muted-foreground">
                  Token expires in 10 minutes.
                </p>
              )}

              {connected ? (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                >
                  Done
                </Button>
              ) : (
                <div className="flex w-full gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleGenerate}
                    disabled={pairingMutation.isPending}
                  >
                    {pairingMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Generate New Token
                  </Button>
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                  >
                    Done
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
      toast.success('Telegram connection disconnected');
      queryClient.invalidateQueries({
        queryKey: ['telegram-connects', integrationId],
      });
    },
    onError: () => {
      toast.error('Failed to disconnect');
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
                Telegram Pairing
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Plug className="size-3.5" />
              Pair
            </Button>
          </div>
          <CardDescription className="text-xs">
            Let users connect their Telegram chat to receive notifications via
            /start command
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
                Connected
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
                        Connected
                      </span>
                      <ConfirmDialog
                        title="Disconnect"
                        description={`Are you sure you want to disconnect ${formatUserNameShort(c)}?`}
                        confirmText="Disconnect"
                        onConfirm={() => disconnectMutation.mutate(c.id)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={disconnectMutation.isPending}
                            aria-label={`Disconnect ${formatUserNameShort(c)}`}
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
                No connected devices yet
              </p>
              <p className="text-xs text-muted-foreground/60">
                Click "Pair New Device" to generate a QR code
              </p>
            </div>
          )}

          {/* Error state */}
          {connectsQuery.isError && (
            <p className="text-xs text-destructive">
              Failed to load connections.{' '}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: ['telegram-connects', integrationId],
                  })
                }
              >
                Retry
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
