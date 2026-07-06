import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerGetWorkspaceApiKey,
  useWorkspacesControllerRotateApiKey,
} from '@/services/apis/gen/queries';
import { Copy, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * API Keys settings component displaying workspace API key with copy and rotate functionality.
 */
export default function ApiKeysSettings() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [copied, setCopied] = useState(false);

  const {
    data: apiKeyData,
    isLoading,
    refetch,
  } = useWorkspacesControllerGetWorkspaceApiKey({
    query: {
      queryKey: [selectedWorkspaceId],
      enabled: !!selectedWorkspaceId,
    },
  });

  const { mutate: rotateApiKey, isPending: isRotating } =
    useWorkspacesControllerRotateApiKey({
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

  const handleCopy = async () => {
    if (apiKeyData?.apiKey) {
      await navigator.clipboard.writeText(apiKeyData.apiKey);
      setCopied(true);
      toast.success('API key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRotate = () => {
    if (!selectedWorkspaceId) return;
    rotateApiKey({ id: selectedWorkspaceId });
  };

  if (!selectedWorkspaceId) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-10">
            <p className="text-center text-muted-foreground">
              No workspace selected. Please select a workspace to manage its API
              keys.
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
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="ml-2 text-muted-foreground">
                Loading API key...
              </span>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="overflow-x-auto h-10 flex justify-center items-center  rounded border">
                  <code>{apiKeyData?.apiKey || 'No API key available'}</code>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!apiKeyData?.apiKey}
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRotate}
                    disabled={isRotating || !selectedWorkspaceId}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isRotating ? 'animate-spin' : ''}`}
                    />
                    {isRotating ? 'Rotating...' : 'Rotate'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Keep your API key secure. Do not share it publicly or commit it
                to version control. Rotating the key will invalidate the current
                one.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
