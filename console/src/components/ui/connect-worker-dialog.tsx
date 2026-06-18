import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerGetWorkspaceApiKey,
  useWorkspacesControllerRotateApiKey,
} from '@/services/apis/gen/queries';
import {
  Code,
  Copy,
  Monitor,
  Package,
  Server,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

const workerTabs: {
  value: string;
  label: string;
  icon: LucideIcon;
  env?: 'dev' | 'prod';
}[] = [
  { value: 'devmode', label: 'DevMode', icon: Code, env: 'dev' },
  { value: 'docker', label: 'Docker', icon: Package, env: 'prod' },
  { value: 'windows', label: 'Windows', icon: Monitor, env: 'prod' },
  { value: 'linux', label: 'Linux', icon: Server, env: 'prod' },
];

export function ConnectWorkerDialog() {
  const {
    state: { isOpen, networkId },
    closeDialog,
  } = useConnectWorkerState();

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data, refetch, isLoading } = useWorkspacesControllerGetWorkspaceApiKey({
    query: {
      queryKey: ['workspaceApiKey', selectedWorkspaceId],
      enabled: !!selectedWorkspaceId && isOpen,
      staleTime: 0,
    },
  });

  useEffect(() => {
    if (isOpen && selectedWorkspaceId) {
      refetch();
    }
  }, [isOpen, selectedWorkspaceId, refetch]);

  const apiKey = data?.apiKey ?? '';
  const isApiKeyReady = !isLoading && !!apiKey;
  const networkFlag = networkId ? ` network=${networkId}` : '';
  const networkFlagPowerShell = networkId ? ` -Network "${networkId}"` : '';
  const networkFlagBash = networkId ? ` --network "${networkId}"` : '';

  const getCommand = (value: string): string => {
    if (!isApiKeyReady) return 'Loading...';
    switch (value) {
      case 'devmode':
        return `task worker:dev replicas=1 maxJobs=10 apiKey=${apiKey}${networkFlag}`;
      case 'docker':
        return `docker run -d --name open-asm-worker -e WORKER_API_KEY=${apiKey} -e WORKER_GRPC_HOST=localhost -e WORKER_GRPC_PORT=16276 -e WORKER_MAX_CONCURRENCY=10 open-asm-worker:latest`;
      case 'windows':
        return `irm https://raw.githubusercontent.com/oasm-platform/open-asm/main/worker/scripts/install.ps1 -OutFile "$env:TEMP\\install.ps1"; & "$env:TEMP\\install.ps1" -ApiKey "${apiKey}"${networkFlagPowerShell} -Run`;
      case 'linux':
        return `curl -fsSL https://raw.githubusercontent.com/oasm-platform/open-asm/main/worker/scripts/install.sh | bash -s -- --api-key "${apiKey}"${networkFlagBash} --run`;
      default:
        return '';
    }
  };

  const { mutate } = useWorkspacesControllerRotateApiKey({
    mutation: {
      onSuccess: () => {
        toast.success('API key rotated successfully');
        refetch();
      },
      onError: () => {
        toast.error('Failed to rotate API key');
      },
    },
  });

  const handleCopyCommand = async (command: string) => {
    await navigator.clipboard.writeText(command);
    toast.success('Command copied to clipboard');
  };

  const isDev = import.meta.env.DEV;
  const visibleTabs = workerTabs.filter(
    (tab) => !tab.env || (tab.env === 'dev' ? isDev : !isDev),
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect worker</DialogTitle>
          <DialogDescription>
            Select your environment and copy the command to connect a worker:
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={visibleTabs[0]?.value} className="space-y-4">
          <TabsList className="w-full">
            {visibleTabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex-1 gap-1.5">
                <Icon size={14} />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {visibleTabs.map(({ value }) => (
            <TabsContent key={value} value={value}>
              <div className="relative bg-muted text-foreground font-mono rounded-md p-4 text-sm">
                <pre className="whitespace-pre-wrap break-all">
                  {getCommand(value)}
                </pre>
                <Button
                  onClick={() => handleCopyCommand(getCommand(value))}
                  size="icon"
                  variant="ghost"
                  disabled={!isApiKeyReady}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                >
                  <Copy size={16} />
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter className="!flex-row !flex-nowrap justify-between items-center gap-2">
          <ConfirmDialog
            title="Rotate API key"
            description="Are you sure you want to rotate the API key?"
            onConfirm={() => mutate({ id: selectedWorkspaceId })}
            trigger={
              <Button variant="outline" type="button">
                Rotate API key
              </Button>
            }
          />
          <DialogClose asChild>
            <Button variant="outline" type="button" onClick={closeDialog}>
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
