import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
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
  const { selectedWorkspace } = useWorkspaceSelector();
  const [copied, setCopied] = useState(false);

  const {
    data: apiKeyData,
    isLoading,
    refetch,
  } = useWorkspacesControllerGetWorkspaceApiKey({
    query: {
      queryKey: [selectedWorkspace],
      enabled: !!selectedWorkspace,
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
    if (!selectedWorkspace) return;
    rotateApiKey({ id: selectedWorkspace });
  };

  if (!selectedWorkspace) {
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
        <CardHeader>
          <CardTitle>Workspace API Key</CardTitle>
          <CardDescription>
            Use this API key to authenticate API requests for this workspace
          </CardDescription>
        </CardHeader>
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
              <div className="flex items-center gap-2">
                <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
                  {apiKeyData?.apiKey || 'No API key available'}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!apiKeyData?.apiKey}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRotate}
                  disabled={isRotating || !selectedWorkspace}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isRotating ? 'animate-spin' : ''}`}
                  />
                  {isRotating ? 'Rotating...' : 'Rotate'}
                </Button>
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
