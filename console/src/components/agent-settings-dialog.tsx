import LlmConnect from '@/components/llm-connect';
import { MCPServersManager } from '@/components/mcp-servers-manager';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KeyRound, Server } from 'lucide-react';

interface AgentSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'llm' | 'mcp';
}

export function AgentSettingsDialog({
  open,
  onOpenChange,
  defaultTab = 'llm',
}: AgentSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 w-full h-full max-w-none rounded-none translate-x-0 translate-y-0 sm:max-w-5xl sm:w-full sm:h-[85vh] sm:rounded-xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Hidden title for accessibility */}
        <DialogTitle className="sr-only">Agent Settings</DialogTitle>

        <Tabs
          defaultValue={defaultTab}
          className="flex flex-col flex-1 min-h-0 gap-0"
        >
          <TabsList className="shrink-0 h-auto w-fit gap-2 rounded-none bg-transparent px-3 py-1.5">
            <TabsTrigger
              value="llm"
              className="data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold border-0 shadow-none"
            >
              <KeyRound className="size-4.5 shrink-0" />
              LLM Providers
            </TabsTrigger>
            <TabsTrigger
              value="mcp"
              className="data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold border-0 shadow-none"
            >
              <Server className="size-4.5 shrink-0" />
              MCP Servers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="llm" className="flex flex-col flex-1 min-h-0 gap-0 mt-0">
            <div className="px-4 pt-2 pb-3 border-b shrink-0 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-lg font-bold tracking-tight">
                  LLM Providers
                </p>
                <p className="text-xs text-muted-foreground">
                  Manage your AI models and API connections
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <LlmConnect />
            </div>
          </TabsContent>

          <TabsContent value="mcp" className="flex flex-col flex-1 min-h-0 gap-0 mt-0">
            <div className="px-4 pt-2 pb-3 border-b shrink-0 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-lg font-bold tracking-tight">
                  MCP Servers
                </p>
                <p className="text-xs text-muted-foreground">
                  Extend agent capabilities with external MCP servers
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <MCPServersManager />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
