import { cn } from '@/lib/utils';
import { Cpu, Database, KeyRound, Server } from 'lucide-react';
import { useState } from 'react';
import AgentSettingsEmbedding from './embedding';
import AgentSettingsLlm from './llm';
import AgentSettingsMcp from './mcp';
import AgentSettingsSkill from './skill';

type TabId = 'llm' | 'mcp' | 'skill' | 'embedding';

interface SettingMenuProps {
  defaultTab?: TabId;
}

const NAV_ITEMS = [
  { id: 'llm' as const, label: 'LLM Providers', icon: KeyRound },
  { id: 'embedding' as const, label: 'Embedding', icon: Database },
  { id: 'mcp' as const, label: 'MCP Servers', icon: Server },
  { id: 'skill' as const, label: 'Agent Skills', icon: Cpu },
];

export default function SettingMenu({ defaultTab = 'llm' }: SettingMenuProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r flex flex-col p-4 gap-1">
        <div className="px-2 mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Agent Config
          </h2>
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 bg-background">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'llm' && <AgentSettingsLlm />}
          {activeTab === 'embedding' && <AgentSettingsEmbedding />}
          {activeTab === 'mcp' && <AgentSettingsMcp />}
          {activeTab === 'skill' && <AgentSettingsSkill />}
        </div>
      </main>
    </div>
  );
}
