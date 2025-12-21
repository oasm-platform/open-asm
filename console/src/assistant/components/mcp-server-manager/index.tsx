import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Server } from 'lucide-react';
import {
  useAiAssistantControllerGetMcpServers,
  useAiAssistantControllerUpdateMcpServers,
} from '@/services/apis/gen/queries';
import { toast } from 'sonner';
import { McpProvider, useMcp } from '../../context/mcp-context';
import type {
  McpServerConfig,
  McpServerConfigWithStatus,
  ApiError,
} from '../../types/mcp';
import { McpServerList } from './mcp-server-list';
import { McpServerEditor } from './mcp-server-editor';

interface McpServerManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function McpServerManagerContent({
  open,
  onOpenChange,
}: McpServerManagerProps) {
  const { data, isLoading, refetch } = useAiAssistantControllerGetMcpServers({
    query: {
      retry: false,
      refetchOnWindowFocus: false,
    },
    request: {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    },
  });
  const updateServerMutation = useAiAssistantControllerUpdateMcpServers();

  const {
    showEditor,
    setShowEditor,
    jsonInput,
    setJsonInput,
    setPendingConfigs,
    pendingToolChanges,
    setPendingToolChanges,
  } = useMcp();

  const mcpServers = (data?.mcpServers || {}) as Record<
    string,
    McpServerConfigWithStatus
  >;

  // Sync pending configs with server data initially or on reset
  useEffect(() => {
    setPendingConfigs({});
    setPendingToolChanges({});
  }, [data, setPendingConfigs, setPendingToolChanges]);

  // Force refresh MCP servers from backend
  const handleRefresh = () => {
    refetch().catch((err) => {
      console.debug('Manual refresh encountered error/cancel:', err);
    });
    toast.success('Refreshing MCP servers...');
  };

  // Show the entire current configuration in JSON
  const handleEditGlobalJson = () => {
    const cleanConfig: Record<string, McpServerConfig> = {};
    Object.entries(mcpServers).forEach(([key, val]) => {
      cleanConfig[key] = {
        command: val.command,
        args: val.args,
        env: val.env,
        url: val.url,
        headers: val.headers,
        disabled: val.disabled,
        timeout: val.timeout,
        allowed_tools: val.allowed_tools,
      };
    });

    setJsonInput(JSON.stringify({ mcpServers: cleanConfig }, null, 2));
    setShowEditor(true);
  };

  const handleJsonSubmit = async () => {
    let serversToUpdate: Record<string, McpServerConfig> = {};

    try {
      const parsed = JSON.parse(jsonInput);

      if (parsed.mcpServers) {
        serversToUpdate = parsed.mcpServers;
      } else {
        if (parsed.command || parsed.url) {
          toast.error(
            'JSON seems to be a single server config. Please wrap it in a server name key, e.g. { "my-server": { ... } }',
          );
          return;
        }
        serversToUpdate = parsed;
      }

      // Relax: allow empty mcpServers object if user wants to clear all servers
      // if (Object.keys(serversToUpdate).length === 0) {
      //   toast.warning('No servers found in JSON');
      //   return;
      // }
    } catch (e) {
      const error = e as Error;
      toast.error('Invalid JSON syntax: ' + error.message);
      return;
    }

    try {
      await updateServerMutation.mutateAsync({
        data: { mcpServers: serversToUpdate },
      });

      toast.success(
        `Successfully imported ${Object.keys(serversToUpdate).length} server(s)`,
      );
      refetch();
      setShowEditor(false);
      setPendingToolChanges({});
    } catch (error) {
      console.error('Import failed:', error);
      const apiError = error as ApiError;
      const msg =
        apiError.response?.data?.message ||
        apiError.message ||
        'Failed to import servers';
      toast.error(`Import Error: ${msg}`);
    }
  };

  const handleToolToggle = async (serverName: string) => {
    // Get the pending changes for this server
    const pendingAllowedTools = pendingToolChanges[serverName];

    if (pendingAllowedTools === undefined) {
      // No pending changes, user probably clicked Save without making changes
      return;
    }

    try {
      // Build complete server config with all servers to avoid deletion,
      // but update the allowed_tools for the target server.
      const allServers: Record<string, McpServerConfig> = {};

      Object.entries(mcpServers).forEach(([key, val]) => {
        allServers[key] = {
          command: val.command,
          args: val.args,
          env: val.env,
          url: val.url,
          headers: val.headers,
          disabled: val.disabled,
          timeout: val.timeout,
          // Update allowed_tools only for the target server
          allowed_tools:
            key === serverName ? pendingAllowedTools : val.allowed_tools,
        };
      });

      await updateServerMutation.mutateAsync({
        data: {
          mcpServers: allServers,
        },
      });

      toast.success(`Updated tools for ${serverName}`);
      refetch();
    } catch (error) {
      console.error('Failed to update tools:', error);
      toast.error('Failed to update tools');
    }
  };

  const handleToggle = async (name: string, currentConfig: McpServerConfig) => {
    try {
      // Build complete server config with all servers to avoid deletion
      const allServers: Record<string, McpServerConfig> = {};

      // Include all existing servers
      Object.entries(mcpServers).forEach(([serverName, serverConfig]) => {
        allServers[serverName] = {
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
          url: serverConfig.url,
          headers: serverConfig.headers,
          timeout: serverConfig.timeout,
          allowed_tools: serverConfig.allowed_tools,
          // Toggle disabled flag only for the target server
          disabled:
            serverName === name
              ? !currentConfig.disabled
              : serverConfig.disabled,
        };
      });

      await updateServerMutation.mutateAsync({
        data: {
          mcpServers: allServers,
        },
      });
      refetch();
      toast.success(
        `Server ${name} ${currentConfig.disabled ? 'enabled' : 'disabled'}`,
      );
    } catch {
      toast.error('Failed to toggle server');
    }
  };

  const handleDelete = async (name: string) => {
    toast.info(
      `To delete '${name}', please use 'Edit Project MCP' and remove it from the JSON configuration.`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP Servers Manager
          </DialogTitle>
          <DialogDescription>
            Configure servers to extend the assistant's capabilities with
            external tools and data.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-0">
          {/* Top Section: Server List & Actions */}
          <div
            className={`bg-background border-b overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${
              showEditor ? 'h-1/2' : 'h-full'
            }`}
          >
            <McpServerList
              servers={mcpServers}
              isLoading={isLoading}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onRefresh={handleRefresh}
              onEditGlobal={handleEditGlobalJson}
              onToolToggle={handleToolToggle}
            />
          </div>

          {/* Bottom Section: Editor */}
          {showEditor && (
            <McpServerEditor
              onSubmit={handleJsonSubmit}
              onClose={() => setShowEditor(false)}
              isPending={updateServerMutation.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Wrapper with Provider
export function McpServerManager(props: McpServerManagerProps) {
  return (
    <McpProvider>
      <McpServerManagerContent {...props} />
    </McpProvider>
  );
}
