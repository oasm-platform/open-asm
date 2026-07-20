import { CopyableValue } from '@/components/common/copyable-value';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useWorkspacesControllerGetWorkspaceApiKey,
  useWorkspacesControllerRotateApiKey,
} from '@/services/apis/gen/queries';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * API Keys settings component displaying workspace API key with copy and rotate functionality.
 */
export default function ApiKeysSettings() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
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
                <CopyableValue
                  value={apiKeyData?.apiKey ?? 'No API key available'}
                  disabled={!apiKeyData?.apiKey}
                />
                <div className="flex justify-center gap-2">
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
