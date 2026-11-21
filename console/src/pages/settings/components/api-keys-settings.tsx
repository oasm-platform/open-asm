import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerGetWorkspaceApiKey,
  useWorkspacesControllerRotateApiKey,
} from '@/services/apis/gen/queries';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';

const MASKED_KEY = '•'.repeat(32);

/**
 * API Keys settings component displaying workspace API key with reveal, copy and rotate functionality.
 */
export default function ApiKeysSettings() {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    data: apiKeyData,
    isLoading,
    refetch,
  } = useWorkspacesControllerGetWorkspaceApiKey({
    query: {
      queryKey: ['/api/workspaces/api-key', selectedWorkspaceId],
      enabled: !!selectedWorkspaceId,
    },
  });

  const { mutate: rotateApiKey, isPending: isRotating } =
    useWorkspacesControllerRotateApiKey({
      mutation: {
        onSuccess: () => {
          toast.success(t('settings.apiKey.rotated'));
          refetch();
        },
        onError: () => {
          toast.error(t('settings.apiKey.rotateFailed'));
        },
      },
    });

  const apiKey = apiKeyData?.apiKey;

  const handleRotate = () => {
    if (!selectedWorkspaceId) return;
    rotateApiKey({ id: selectedWorkspaceId });
  };

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      toast.success(t('settings.apiKey.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('settings.apiKey.copyFailed'));
    }
  };

  if (!selectedWorkspaceId) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-10">
            <p className="text-center text-muted-foreground">
              {t('settings.apiKey.noWorkspace')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">{t('settings.apiKey.secretKey')}</span>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="flex h-10 min-w-0 items-center gap-1 rounded-md border bg-muted/40 pr-1 pl-3">
                <code
                  className={`min-w-0 flex-1 truncate font-mono text-sm ${
                    apiKey && !revealed ? 'tracking-widest' : ''
                  } ${apiKey ? '' : 'text-muted-foreground'}`}
                >
                  {!apiKey
                    ? t('settings.apiKey.none')
                    : revealed
                      ? apiKey
                      : MASKED_KEY}
                </code>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRevealed((v) => !v)}
                      disabled={!apiKey}
                      aria-label={revealed ? t('settings.apiKey.hide') : t('settings.apiKey.show')}
                    >
                      {revealed ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {revealed ? t('settings.apiKey.hideShort') : t('settings.apiKey.showShort')}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={handleCopy}
                      disabled={!apiKey}
                      aria-label={t('settings.apiKey.copy')}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {copied ? t('settings.mcp.copiedShort') : t('common.copy')}
                  </TooltipContent>
                </Tooltip>
                <div className="mx-1 h-5 w-px bg-border" />
                <ConfirmDialog
                  title={t('settings.apiKey.rotate.title')}
                  description={t('settings.apiKey.rotate.description')}
                  confirmText={t('settings.apiKey.rotate.confirm')}
                  onConfirm={handleRotate}
                  disabled={isRotating || !apiKey}
                  typeToConfirm="rotate"
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      disabled={isRotating || !apiKey}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${isRotating ? 'animate-spin' : ''}`}
                      />
                      {isRotating ? t('settings.apiKey.rotating') : t('settings.apiKey.rotate.confirm')}
                    </Button>
                  }
                />
              </div>
            )}
          </div>
          <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <p className="text-muted-foreground">
              {t('settings.apiKey.warning')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
