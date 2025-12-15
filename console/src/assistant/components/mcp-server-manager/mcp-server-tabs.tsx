import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Box, FileText } from 'lucide-react';
import type { McpServerConfigWithStatus } from '../../types/mcp';
import { useMcp } from '../../context/mcp-context';

interface McpServerTabsProps {
  serverName: string;
  config: McpServerConfigWithStatus;
}

export function McpServerTabs({ serverName, config }: McpServerTabsProps) {
  const { pendingToolChanges, setPendingToolChanges } = useMcp();

  // Get effective allowed tools (pending changes take priority)
  const effectiveAllowedTools =
    pendingToolChanges[serverName] !== undefined
      ? pendingToolChanges[serverName]
      : config.allowed_tools;

  const handleToolToggle = (toolName: string, targetState: boolean) => {
    const allToolNames = config.tools?.map((t) => t.name) || [];
    let newAllowedTools: string[] | null = effectiveAllowedTools || null;

    if (targetState === false) {
      // Disable tool
      if (newAllowedTools === null) {
        newAllowedTools = allToolNames.filter((name) => name !== toolName);
      } else {
        newAllowedTools = newAllowedTools.filter((name) => name !== toolName);
      }
    } else {
      // Enable tool
      if (newAllowedTools !== null) {
        newAllowedTools = [...newAllowedTools, toolName];
        // If all tools are enabled, set to null (meaning all allowed)
        if (newAllowedTools.length === allToolNames.length) {
          newAllowedTools = null;
        }
      }
    }

    // Update pending changes
    setPendingToolChanges((prev) => ({
      ...prev,
      [serverName]: newAllowedTools,
    }));
  };

  return (
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
              const isAllowed =
                !effectiveAllowedTools ||
                effectiveAllowedTools.includes(tool.name);

              return (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={isAllowed}
                    onCheckedChange={(checked) =>
                      handleToolToggle(tool.name, checked === true)
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
                      {tool.description || 'No description provided.'}
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
                <span className="font-mono text-xs">{res.uri}</span>
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
  );
}
