import { useCallback, useEffect, useMemo } from 'react';
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

  const mcpServers = useMemo(
    () => (data?.mcpServers || {}) as Record<string, McpServerConfigWithStatus>,
    [data],
  );

  // Sync pending configs with server data initially or on reset
  useEffect(() => {
    setPendingConfigs({});
    setPendingToolChanges({});
  }, [data, setPendingConfigs, setPendingToolChanges]);

  // Helper to extract clean config from servers (removing backend-added status fields)
  const getCleanServersConfig = useCallback(
    (updates?: {
      name: string;
      config?: Partial<McpServerConfig>;
      remove?: boolean;
    }) => {
      const cleanConfig: Record<string, McpServerConfig> = {};

      Object.entries(mcpServers).forEach(([key, val]) => {
        // Skip if this is the one we're removing
        if (updates?.remove && updates.name === key) return;

        cleanConfig[key] = {
          command: val.command,
          args: val.args,
          env: val.env,
          url: val.url,
          headers: val.headers,
          disabled: val.disabled,
          timeout: val.timeout,
          allowed_tools: val.allowed_tools,
          // Apply updates if this is the target server
          ...(updates?.name === key ? updates.config : {}),
        };
      });

      return cleanConfig;
    },
    [mcpServers],
  );

  // Centralized update function
  const updateServers = useCallback(
    async (
      newConfigs: Record<string, McpServerConfig>,
      successMsg?: string,
    ) => {
      try {
        await updateServerMutation.mutateAsync({
          data: { mcpServers: newConfigs },
        });

        if (showEditor) {
          setJsonInput(JSON.stringify({ mcpServers: newConfigs }, null, 2));
        }

        if (successMsg) toast.success(successMsg);
        refetch();
        return true;
      } catch (error) {
        const apiError = error as ApiError;
        const msg =
          apiError.response?.data?.message ||
          apiError.message ||
          'Failed to update servers';
        toast.error(`Error: ${msg}`);
        return false;
      }
    },
    [updateServerMutation, showEditor, setJsonInput, refetch],
  );

  const handleRefresh = () => {
    refetch().catch((err) => {
      console.debug('Manual refresh encountered error/cancel:', err);
    });
    toast.success('Refreshing MCP servers...');
  };

  const handleEditGlobalJson = () => {
    const cleanConfig = getCleanServersConfig();
    setJsonInput(JSON.stringify({ mcpServers: cleanConfig }, null, 2));
    setShowEditor(true);
  };

  const handleJsonSubmit = async () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const serversToUpdate = parsed.mcpServers || parsed;

      if (parsed.command || parsed.url) {
        toast.error(
          'JSON seems to be a single server config. Please wrap it in a server name key.',
        );
        return;
      }

      const success = await updateServers(
        serversToUpdate,
        `Successfully imported ${Object.keys(serversToUpdate).length} server(s)`,
      );
      if (success) {
        setShowEditor(false);
        setPendingToolChanges({});
      }
    } catch (e) {
      toast.error('Invalid JSON syntax: ' + (e as Error).message);
    }
  };

  const handleToolToggle = async (serverName: string) => {
    const pendingAllowedTools = pendingToolChanges[serverName];
    if (pendingAllowedTools === undefined) return;

    const newConfigs = getCleanServersConfig({
      name: serverName,
      config: { allowed_tools: pendingAllowedTools },
    });

    await updateServers(newConfigs, `Updated tools for ${serverName}`);
  };

  const handleToggle = async (name: string, currentConfig: McpServerConfig) => {
    const newConfigs = getCleanServersConfig({
      name,
      config: { disabled: !currentConfig.disabled },
    });

    await updateServers(
      newConfigs,
      `Server ${name} ${currentConfig.disabled ? 'enabled' : 'disabled'}`,
    );
  };

  const handleDelete = async (name: string) => {
    const newConfigs = getCleanServersConfig({ name, remove: true });
    await updateServers(newConfigs, `Server '${name}' deleted successfully`);
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
