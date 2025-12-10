import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  useAiAssistantControllerGetMcpServers,
  useAiAssistantControllerUpdateMcpServers,
} from '@/services/apis/gen/queries';
import {
  Loader2,
  Server,
  Code2,
  X,
  Edit,
  Trash2,
  RefreshCw,
  Box,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface McpResource {
  uri: string;
  name: string;
  mimeType?: string;
}

interface McpServerConfig {
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  allowed_tools?: string[] | null; // null or empty means all tools allowed
  timeout?: number; // timeout in seconds, default 60
}

interface McpServerConfigWithStatus extends McpServerConfig {
  active: boolean;
  status: 'active' | 'disabled' | 'error';
  error?: string;
  tools?: McpTool[];
  resources?: McpResource[];
}

interface McpServerManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

export function McpServerManager({
  open,
  onOpenChange,
}: McpServerManagerProps) {
  const { data, isLoading, refetch } = useAiAssistantControllerGetMcpServers({
    query: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  });
  const updateServerMutation = useAiAssistantControllerUpdateMcpServers();

  const [showEditor, setShowEditor] = useState(false);

  // JSON State
  const [jsonInput, setJsonInput] = useState('');

  // Pending state for UI responsiveness before saving
  const [pendingConfigs, setPendingConfigs] = useState<
    Record<string, McpServerConfig>
  >({});

  const mcpServers = (data?.mcpServers || {}) as Record<
    string,
    McpServerConfigWithStatus
  >;

  // Sync pending configs with server data initially or on reset
  useEffect(() => {
    setPendingConfigs({});
  }, [data]);

  // Force refresh MCP servers from backend
  const handleRefresh = () => {
    // Use refetch() directly from the hook.
    // It ignores staleTime and fetches fresh data from the server.
    refetch().catch((err) => {
      // Ignore cancellation errors during refresh
      console.debug('Manual refresh encountered error/cancel:', err);
    });
    toast.success('Refreshing MCP servers...');
  };

  // Show the entire current configuration in JSON
  const handleEditGlobalJson = () => {
    // Clean up the status/active fields for display, user only edits config
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

      // Determine format.
      // 1. Matches wrapper structure { mcpServers: { ... } }
      // 2. Matches Record<string, Config> { "server1": { ... } }

      if (parsed.mcpServers) {
        serversToUpdate = parsed.mcpServers;
      } else {
        // Assume the root object is the map of servers if it doesn't have mcpServers key
        // AND doesn't look like a single server config (checking keys like 'command' or 'url').
        if (parsed.command || parsed.url) {
          toast.error(
            'JSON seems to be a single server config. Please wrap it in a server name key, e.g. { "my-server": { ... } }',
          );
          return;
        }
        serversToUpdate = parsed;
      }

      if (Object.keys(serversToUpdate).length === 0) {
        toast.warning('No servers found in JSON');
        return;
      }
    } catch (e) {
      const error = e as Error;
      toast.error('Invalid JSON syntax: ' + error.message);
      return;
    }

    try {
      // Use update endpoint to merge/overwrite
      await updateServerMutation.mutateAsync({
        data: { mcpServers: serversToUpdate },
      });

      toast.success(
        `Successfully imported ${Object.keys(serversToUpdate).length} server(s)`,
      );
      refetch();
      setShowEditor(false);
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

  const handleToolToggle = (
    serverName: string,
    toolName: string,
    currentConfig: McpServerConfigWithStatus,
    targetState: boolean,
  ) => {
    // 1. Calculate new allowed_tools list
    let newAllowedTools: string[] | null = currentConfig.allowed_tools || null;
    const allToolNames = currentConfig.tools?.map((t) => t.name) || [];

    if (targetState === false) {
      // User is UNCHECKING (Disabling)
      if (newAllowedTools === null) {
        // Currently all allowed (null), so we explicit list everyone EXCEPT this one
        newAllowedTools = allToolNames.filter((name) => name !== toolName);
      } else {
        // Currently explicit list, remove this one
        newAllowedTools = newAllowedTools.filter((name) => name !== toolName);
      }
    } else {
      // User is CHECKING (Enabling)
      if (newAllowedTools !== null) {
        newAllowedTools = [...newAllowedTools, toolName];
        // If the new list includes ALL tools, we COULD reset to null,
        // but keeping it explicit is often safer/clearer for the user editing JSON.
        // If you prefer auto-reset to null (allow all):
        if (newAllowedTools.length === allToolNames.length) {
          newAllowedTools = null;
        }
      }
    }

    // 2. Construct the full clean config object to put in JSON Editor
    const cleanConfig: Record<string, McpServerConfig> = {};
    Object.entries(mcpServers).forEach(([key, val]) => {
      // Use pending config if available for other servers to keep consistent state
      const effectiveConfig = pendingConfigs[key] || val;

      cleanConfig[key] = {
        command: effectiveConfig.command,
        args: effectiveConfig.args,
        env: effectiveConfig.env,
        url: effectiveConfig.url,
        headers: effectiveConfig.headers,
        disabled: effectiveConfig.disabled,
        timeout: effectiveConfig.timeout,
        allowed_tools:
          key === serverName ? newAllowedTools : effectiveConfig.allowed_tools,
      };
    });

    // 3. Update Local Pending State
    setPendingConfigs((prev) => ({
      ...prev,
      [serverName]: {
        ...currentConfig,
        allowed_tools: newAllowedTools,
      },
    }));

    // 4. Update JSON Input and Show Editor
    setJsonInput(JSON.stringify({ mcpServers: cleanConfig }, null, 2));
    setShowEditor(true);
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
            className={`bg-background border-b overflow-y-auto custom-scrollbar ${
              showEditor ? 'h-1/2' : 'h-full'
            }`}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
                  Configured Servers ({Object.keys(mcpServers).length})
                </h3>
              </div>

              {/* Accordion List */}
              <Accordion type="single" collapsible className="w-full space-y-2">
                {Object.entries(mcpServers).map(([name, config]) => (
                  <AccordionItem
                    key={name}
                    value={name}
                    className="border rounded-lg bg-card px-0 group"
                  >
                    <div className="flex items-center justify-between px-4 py-2">
                      <AccordionTrigger className="hover:no-underline py-0 flex-1 [&>svg]:hidden">
                        <div className="flex items-center gap-3">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              config.status === 'active'
                                ? 'bg-green-500'
                                : config.status === 'disabled'
                                  ? 'bg-gray-400'
                                  : 'bg-red-500'
                            }`}
                          />
                          <span className="font-medium">{name}</span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground"
                          >
                            project
                          </Badge>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </div>
                      </AccordionTrigger>

                      {/* Actions Row */}
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            refetch();
                          }}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>

                        <Switch
                          checked={!config.disabled}
                          onCheckedChange={() => handleToggle(name, config)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    <AccordionContent className="px-4 pb-4 pt-0 border-t">
                      <Tabs defaultValue="tools" className="w-full mt-4">
                        <TabsList className="h-8 w-full justify-start rounded-none border-b bg-transparent p-0 mb-4">
                          <TabsTrigger
                            value="tools"
                            className="relative h-8 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-2 pt-1 font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                          >
                            Tools ({config.tools?.length || 0})
                          </TabsTrigger>
                          <TabsTrigger
                            value="resources"
                            className="relative h-8 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-2 pt-1 font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                          >
                            Resources ({config.resources?.length || 0})
                          </TabsTrigger>
                          <TabsTrigger
                            value="logs"
                            className="relative h-8 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-2 pt-1 font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                          >
                            Logs (0)
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="tools" className="space-y-4">
                          {config.tools && config.tools.length > 0 ? (
                            <div className="space-y-3">
                              {config.tools.map((tool, idx) => {
                                // Logic to determine if allowed: check pending first, then server config
                                const effectiveAllowedTools =
                                  pendingConfigs[name]?.allowed_tools !==
                                  undefined
                                    ? pendingConfigs[name].allowed_tools
                                    : config.allowed_tools;

                                const isAllowed =
                                  !effectiveAllowedTools ||
                                  effectiveAllowedTools.length === 0 ||
                                  effectiveAllowedTools.includes(tool.name);
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-start gap-3 text-sm"
                                  >
                                    <Checkbox
                                      checked={isAllowed}
                                      onCheckedChange={(checked) =>
                                        handleToolToggle(
                                          name,
                                          tool.name,
                                          config,
                                          checked === true,
                                        )
                                      }
                                      className="mt-1"
                                    />
                                    <Box className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {tool.name}
                                        {!isAllowed && (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] h-4 px-1"
                                          >
                                            Disabled
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-muted-foreground text-xs mt-0.5">
                                        {tool.description ||
                                          'No description provided.'}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground py-4 text-center">
                              No tools available.
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="resources" className="space-y-4">
                          {config.resources && config.resources.length > 0 ? (
                            <div className="space-y-2">
                              {config.resources.map((res, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 text-sm p-2 bg-muted/30 rounded border"
                                >
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-mono text-xs">
                                    {res.uri}
                                  </span>
                                  <span className="text-muted-foreground text-xs ml-auto">
                                    {res.name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground py-4 text-center">
                              No resources available.
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="logs">
                          <div className="text-sm text-muted-foreground py-4 text-center">
                            No logs available.
                          </div>
                        </TabsContent>
                      </Tabs>

                      {/* Additional Info / Footer */}
                      <div className="mt-4 pt-4 border-t flex items-center text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>Timeout: {config.timeout || 60}s</span>
                          {config.allowed_tools &&
                            config.allowed_tools.length > 0 && (
                              <span className="ml-2">
                                • {config.allowed_tools.length} tool(s) allowed
                              </span>
                            )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}

                {Object.keys(mcpServers).length === 0 && !isLoading && (
                  <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed rounded-lg gap-2">
                    <p>No servers configured.</p>
                  </div>
                )}
              </Accordion>

              {/* Action Buttons - Moved below Configured Servers */}
              <div className="flex gap-2 mt-6">
                <Button
                  variant="default"
                  className="h-10 justify-start text-xs sm:text-sm flex-1"
                  onClick={handleEditGlobalJson}
                >
                  <Edit className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Edit MCP Servers</span>
                  <span className="xs:hidden">Edit MCP</span>
                </Button>

                <Button
                  variant="secondary"
                  className="h-10 justify-start text-xs sm:text-sm flex-1"
                  onClick={handleRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={`mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 ${isLoading ? 'animate-spin' : ''}`}
                  />
                  <span className="hidden xs:inline">Refresh MCP Servers</span>
                  <span className="xs:hidden">Refresh</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Bottom Section: Editor */}
          {showEditor && (
            <div className="flex-1 overflow-hidden p-6 bg-background flex flex-col gap-4 border-t">
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <Code2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold">Edit MCP Configuration</h3>
                    <p className="text-xs text-muted-foreground">
                      Edit the entire configuration in JSON format
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEditor(false)}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 relative min-h-0 flex flex-col gap-2">
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="font-mono text-sm flex-1 w-full resize-none p-4 custom-scrollbar"
                  style={{
                    scrollbarWidth: 'none',
                  }}
                  placeholder={`{\n  "mcpServers": {\n    "server-name": {\n      "url": "http://...",\n      "headers": {"api-key": "..."},\n      "timeout": 60,\n      "allowed_tools": null\n    }\n  }\n}`}
                />
              </div>

              <div className="flex justify-between items-center shrink-0 pt-2 border-t">
                <span className="text-xs text-muted-foreground">
                  Configure advanced server settings including timeouts,
                  execution environments, and tool access controls.
                </span>
                <Button
                  onClick={handleJsonSubmit}
                  disabled={updateServerMutation.isPending}
                >
                  {updateServerMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Configuration
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
          display: none;
        }
        .custom-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
      `,
        }}
      />
    </Dialog>
  );
}
