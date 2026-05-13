import LlmConnect from '@/components/llm-connect';
import { MCPServersManager } from '@/components/mcp-servers-manager';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { KeyRound, Server } from 'lucide-react';
import { useState } from 'react';

interface AgentSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'llm' | 'mcp';
}

const NAV_ITEMS = [
  { id: 'llm' as const, label: 'LLM Providers', icon: KeyRound },
  { id: 'mcp' as const, label: 'MCP Servers', icon: Server },
];

export function AgentSettingsDialog({
  open,
  onOpenChange,
  defaultTab = 'llm',
}: AgentSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'llm' | 'mcp'>(defaultTab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full h-[85vh] flex flex-col gap-0 p-0 overflow-hidden sm:rounded-xl">
        {/* Hidden title for accessibility */}
        <DialogTitle className="sr-only">Agent Settings</DialogTitle>

        <div className="flex flex-1 min-h-0">
          {/* Left sidebar */}
          <aside className="w-60 shrink-0 border-r flex flex-col bg-muted/30">
            <div className="px-4 pt-5 pb-3">
              <p className="text-sm font-semibold text-foreground">Agent Settings</p>
            </div>
            <nav className="flex flex-col gap-0.5 px-2 flex-1">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left w-full',
                    activeTab === id
                      ? 'bg-background text-foreground shadow-sm border border-border/60'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Right content */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="px-6 pt-5 pb-3 border-b shrink-0">
              <p className="text-base font-semibold">
                {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {activeTab === 'llm' && <LlmConnect />}
              {activeTab === 'mcp' && <MCPServersManager />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
