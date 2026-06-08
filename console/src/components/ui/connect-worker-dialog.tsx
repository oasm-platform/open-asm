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
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerGetWorkspaceApiKey,
  useWorkspacesControllerRotateApiKey,
} from '@/services/apis/gen/queries';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

export function ConnectWorkerDialog() {
  const {
    state: { isOpen, networkId },
    closeDialog,
  } = useConnectWorkerState();

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data, refetch } = useWorkspacesControllerGetWorkspaceApiKey({
    query: {
      queryKey: [selectedWorkspaceId],
      enabled: !!selectedWorkspaceId && isOpen,
    },
  });

  const rawCommand = import.meta.env.PROD
    ? `docker run -d --name open-asm-worker -e API_KEY=${data?.apiKey} -e API=${window.location.origin} -e MAX_JOBS=10 open-asm-worker:latest`
    : `task worker:dev replicas=1 maxJobs=10 apiKey=${data?.apiKey} ${networkId ? `network=${networkId}` : ''}`;

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

  if (import.meta.env.PROD) return null;

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(rawCommand);
    toast.success('Command copied to clipboard');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect worker</DialogTitle>
          <DialogDescription>
            Copy and paste the following code and API key into your worker:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative bg-muted text-foreground font-mono rounded-md p-4 text-sm">
            <pre className="whitespace-pre-wrap break-all">{rawCommand}</pre>
            <Button
              onClick={handleCopyCommand}
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            >
              <Copy size={16} />
            </Button>
          </div>
        </div>
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
