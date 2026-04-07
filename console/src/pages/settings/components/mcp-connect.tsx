import { Card, CardContent } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import ViewCode from '@/pages/assets/components/view-code';
import { useWorkspacesControllerGetWorkspaceApiKey } from '@/services/apis/gen/queries';
import { RefreshCw } from 'lucide-react';

/**
 * MCP Connect settings component displaying MCP server configuration JSON.
 */
export default function McpConnect() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data: apiKeyData, isLoading } =
    useWorkspacesControllerGetWorkspaceApiKey({
      query: {
        queryKey: [selectedWorkspaceId],
        enabled: !!selectedWorkspaceId,
      },
    });

  // Generate MCP server configuration JSON
  const generateMcpConfig = () => {
    const apiKey = apiKeyData?.apiKey || 'YOUR_API_KEY';
    const baseUrl = window.location.origin;

    return JSON.stringify(
      {
        mcpServers: {
          'oasm-platform': {
            url: `${baseUrl}/api/mcp`,
            headers: {
              'api-key': apiKey,
            },
          },
        },
      },
      null,
      2,
    );
  };

  const mcpConfig = generateMcpConfig();

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="ml-2 text-muted-foreground">
                Loading configuration...
              </span>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Use this configuration to connect your MCP client to the OASM
                  server. Copy the JSON below and add it to your MCP client
                  configuration file.
                </p>
                <ViewCode code={mcpConfig} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
