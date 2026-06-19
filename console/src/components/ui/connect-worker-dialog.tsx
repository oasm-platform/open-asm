import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerGetWorkspaceApiKey,
  useWorkspacesControllerRotateApiKey,
} from '@/services/apis/gen/queries';
import { Code } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { toast } from 'sonner';
import { CodeBlock } from '@/components/common/code-block';

const workerTabs: {
  value: string;
  label: string;
  icon: ReactNode;
  env?: 'dev' | 'prod';
}[] = [
  {
    value: 'devmode',
    label: 'DevMode',
    icon: (
      <span className="flex size-5 items-center justify-center rounded-sm bg-white">
        <Code color="black" size={14} />
      </span>
    ),
    env: 'dev',
  },
  // { value: 'docker', label: 'Docker', icon: Package, env: 'prod' },
  {
    value: 'windows',
    label: 'Windows',
    icon: (
      <span className="flex size-5 items-center justify-center rounded-sm bg-white">
        <img src="/windows.svg" width={14} height={14} alt="" />
      </span>
    ),
    env: 'prod',
  },
  {
    value: 'linux',
    label: 'Linux',
    icon: (
      <span className="flex size-5 items-center justify-center rounded-sm bg-white">
        <img src="/linux.svg" width={14} height={14} alt="" />
      </span>
    ),
    env: 'prod',
  },
];

export function ConnectWorkerDialog() {
  const {
    state: { isOpen, networkId },
    closeDialog,
  } = useConnectWorkerState();

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data, refetch, isLoading } =
    useWorkspacesControllerGetWorkspaceApiKey({
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
  const grpcHost = window.location.hostname || 'localhost';
  const grpcFlagPowerShell = ` -GrpcHost "${grpcHost}"`;
  const grpcFlagBash = ` --grpc-host "${grpcHost}"`;
  const networkFlag = networkId ? ` network=${networkId}` : '';
  const networkFlagPowerShell = networkId ? ` -Network "${networkId}"` : '';
  const networkFlagBash = networkId ? ` --network "${networkId}"` : '';

  const getCommand = (value: string): string => {
    if (!isApiKeyReady) return 'Loading...';
    switch (value) {
      case 'devmode':
        return `task worker:dev replicas=1 maxJobs=10 apiKey=${apiKey}${networkFlag}`;
      case 'docker':
        return `docker run -d --name open-asm-worker -e WORKER_API_KEY=${apiKey} -e WORKER_GRPC_HOST=${grpcHost} -e WORKER_GRPC_PORT=16276 -e WORKER_MAX_CONCURRENCY=10 open-asm-worker:latest`;
      case 'windows':
        return `powershell irm https://oasm.dev/install.ps1 -OutFile "$env:TEMP\\install.ps1"; & "$env:TEMP\\install.ps1" -ApiKey "${apiKey}"${grpcFlagPowerShell}${networkFlagPowerShell} -Run`;
      case 'linux':
        return `curl -fsSL https://oasm.dev/install.sh | bash -s -- --api-key "${apiKey}"${grpcFlagBash}${networkFlagBash} --run`;
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
            {visibleTabs.map(({ value, label, icon }) => (
              <TabsTrigger key={value} value={value} className="flex-1 gap-1.5">
                {icon}
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {visibleTabs.map(({ value }) => (
            <TabsContent key={value} value={value}>
              <CodeBlock language="terminal" value={getCommand(value)} />
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
