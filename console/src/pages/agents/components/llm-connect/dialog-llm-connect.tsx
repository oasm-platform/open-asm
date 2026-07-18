import { Button } from '@/components/ui/button';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import { LLMConfigWithProviderDtoProviderId } from '@/services/apis/gen/queries';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import Image from '@/components/ui/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConnectForm } from './connect-form';
import type { ConnectFormData } from './schema';

const ALL_PROVIDERS = Object.values(
  LLMConfigWithProviderDtoProviderId,
) as string[];

export function DialogLLMConnect({
  providersList,
  onSubmit,
}: {
  providersList: LLMConfigWithProviderDto[];
  onSubmit: (data: ConnectFormData, providerId: string) => Promise<void>;
}) {
  const [dialogProvider, setDialogProvider] =
    useState<LLMConfigWithProviderDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogClose = useCallback(() => setDialogProvider(null), []);

  const handleProviderClick = useCallback(
    (pid: string) => {
      const entry = providersList.find(
        (p) => p.providerId === pid && !p.isConnected,
      ) ??
        providersList.find((p) => p.providerId === pid) ?? {
          providerId: pid as LLMConfigWithProviderDto['providerId'],
          providerName: pid,
          isConnected: false,
          isAcceptCustomApiUrl: false,
        };
      setDialogProvider(entry);
    },
    [providersList],
  );

  const handleConnectSubmit = useCallback(
    async (data: ConnectFormData, providerId: string) => {
      setIsSubmitting(true);
      try {
        await onSubmit(data, providerId);
        handleDialogClose();
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSubmit, handleDialogClose],
  );

  return (
    <>
      <div className="flex flex-col gap-1 w-full">
        {ALL_PROVIDERS.map((pid) => {
          const meta = providersList.find((p) => p.providerId === pid);
          return (
            <div
              key={pid}
              className="flex items-center justify-between px-3 py-2 transition-colors"
            >
              <div className="flex items-center gap-2">
                {meta?.logo && (
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white shrink-0">
                    <Image width={24} height={24} url={meta.logo} />
                  </div>
                )}
                <span className="text-sm">{meta?.providerName ?? pid}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleProviderClick(pid)}
                className="gap-1"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">Connect</span>
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={!!dialogProvider} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {dialogProvider?.providerName}</DialogTitle>
          </DialogHeader>
          {dialogProvider && (
            <ConnectForm
              key={dialogProvider.providerId}
              provider={dialogProvider}
              onSubmit={handleConnectSubmit}
              onCancel={handleDialogClose}
              isSubmitting={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
