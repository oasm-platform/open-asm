import LlmConnect from '@/components/llm-connect';
import { MCPServersManager } from '@/components/mcp-servers-manager';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { KeyRound, Server } from 'lucide-react';
import { useState } from 'react';

interface AgentSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'llm' | 'mcp';
}

interface TabItem {
  id: 'llm' | 'mcp';
  label: string;
  icon: typeof KeyRound;
  element: React.ReactNode;
  title: string;
  description: string;
}

const TABS: TabItem[] = [
  { id: 'llm', label: 'LLM Providers', icon: KeyRound, element: <LlmConnect />, title: 'LLM Providers', description: 'Manage your AI models and API connections' },
  { id: 'mcp', label: 'MCP Servers', icon: Server, element: <MCPServersManager />, title: 'MCP Servers', description: 'Extend agent capabilities with external MCP servers' },
];

export function AgentSettingsDialog({
  open,
  onOpenChange,
  defaultTab = 'llm',
}: AgentSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabItem['id']>(defaultTab);
  const active = TABS.find((t) => t.id === activeTab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full h-[85vh] flex flex-col gap-0 p-0 overflow-hidden sm:rounded-xl">
        {/* Hidden title for accessibility */}
        <DialogTitle className="sr-only">Agent Settings</DialogTitle>

        <div className="flex flex-1 min-h-0">
          {/* Left sidebar */}
          <aside className="w-60 shrink-0 border-r flex flex-col bg-sidebar">
            <div className="px-6 pt-6 pb-4">
              <p className="text-[10px] font-bold text-sidebar-foreground/50 uppercase tracking-widest">
                Agent Settings
              </p>
            </div>
            <nav className="flex flex-col gap-1 px-3 flex-1">
              {TABS.map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id;

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200 text-left w-full border border-transparent',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                    )}
                  >

                    <Icon
                      className={cn(
                        'size-4.5 shrink-0 transition-colors',
                        isActive
                          ? 'text-sidebar-primary'
                          : 'group-hover:text-sidebar-foreground',
                      )}
                    />
                    {label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Right content */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-background/50">
            <div className="px-6 pt-3 pb-4 border-b shrink-0 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-lg font-bold tracking-tight">
                  {active?.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {active?.description}
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {active?.element}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
