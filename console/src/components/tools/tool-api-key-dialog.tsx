import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useToolsControllerGetToolApiKey,
  useToolsControllerRotateToolApiKey,
  type Tool
} from '@/services/apis/gen/queries';
import { Copy, Key, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ToolApiKeyDialogProps {
  tool: Tool;
}

export function ToolApiKeyDialog({ tool }: ToolApiKeyDialogProps) {
  const [isRotating, setIsRotating] = useState(false);
  const [open, setOpen] = useState<boolean>(false);

  // Fetch API key when dialog opens
  const { data, isLoading, refetch } = useToolsControllerGetToolApiKey(
    tool.id,
    {
      query: {
        enabled: open && !!tool.id, // Only fetch when dialog is open and toolId exists
      },
    }
  );

  // Rotate API key mutation
  const { mutate: rotateApiKey, isPending: isRotatingPending } = useToolsControllerRotateToolApiKey({
    mutation: {
      onSuccess: () => {
        toast('API key rotated successfully');
        // Refetch the new API key after rotation
        refetch();
        setIsRotating(false);
      },
      onError: () => {
        toast('Failed to rotate API key');
        setIsRotating(false);
      },
    },
  });

  // Refetch data when dialog opens to ensure we have the latest data
  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  const handleCopy = () => {
    navigator.clipboard.writeText(data?.apiKey || '');
    toast('API key copied to clipboard');
  };

  const handleRotate = () => {
    setIsRotating(true);
    rotateApiKey({ id: tool.id });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Key className="w-4 h-4 mr-2" />
          API
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tool API Key</DialogTitle>
          <DialogDescription>
            Use this API key to authenticate with the tool.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <div className="grid flex-1 gap-2">
            <Input
              readOnly
              value={isLoading ? 'Loading...' : (data?.apiKey || '')}
              className="font-mono"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="px-3"
            onClick={handleCopy}
            disabled={isLoading || !data?.apiKey}
          >
            <span className="sr-only">Copy</span>
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <DialogFooter className="flex justify-between items-center gap-2">
          <ConfirmDialog
            title="Rotate API Key"
            description="Are you sure you want to rotate the API key? This will invalidate the current key."
            onConfirm={handleRotate}
            trigger={
              <Button
                type="button"
                variant="outline"
                disabled={isRotatingPending || isRotating}
              >
                {(isRotatingPending || isRotating) ? (
                  <>
                    <RotateCw className="w-4 h-4 mr-2 animate-spin" />
                    Rotating...
                  </>
                ) : (
                  <>
                    <RotateCw className="w-4 h-4 mr-2" />
                    Rotate Key
                  </>
                )}
              </Button>
            }
          />
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}