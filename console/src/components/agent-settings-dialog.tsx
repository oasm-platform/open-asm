import LlmConnect from '@/components/llm-connect';
import { MemoryManager } from '@/components/memory-manager';
import { SkillsManager } from '@/components/skills-manager';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Brain, KeyRound } from 'lucide-react';
import { type ComponentType, type SVGProps } from 'react';

interface TabConfig {
  value: 'provider' | 'skills' | 'memory';
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  component: ComponentType;
}

const tabs: TabConfig[] = [
  {
    value: 'provider',
    label: 'Providers',
    description: 'Manage your AI models and API connections',
    icon: KeyRound,
    component: LlmConnect,
  },
  {
    value: 'skills',
    label: 'Skills',
    description: 'Specialized instructions the agent can use to perform tasks',
    icon: BookOpen,
    component: SkillsManager,
  },
  {
    value: 'memory',
    label: 'Memory',
    description: 'Long-term memory content used by the AI agent',
    icon: Brain,
    component: MemoryManager,
  },
];

const triggerClassName =
  'data-[state=active]:bg-sidebar-accent border-sidebar-accent data-[state=active]:text-sidebar-accent-foreground text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold border-0 shadow-none';

interface AgentSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'provider' | 'skills' | 'memory';
}

export function AgentSettingsDialog({
  open,
  onOpenChange,
  defaultTab = 'provider',
}: AgentSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 w-full h-full max-w-none rounded-none translate-x-0 translate-y-0 sm:max-w-3xl sm:w-full sm:h-[80vh] sm:rounded-xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] flex flex-col gap-0 px-4 py-4 overflow-hidden">
        <DialogTitle className="sr-only">Agent Settings</DialogTitle>

        <Tabs
          defaultValue={defaultTab}
          className="flex flex-col flex-1 min-h-0 gap-0"
        >
          <TabsList className="shrink-0 p-0 h-auto w-fit gap-2 rounded-none bg-transparent">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={triggerClassName}
                >
                  <Icon className="size-4.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {tabs.map((tab) => {
            const Component = tab.component;
            return (
              <TabsContent
                key={tab.value}
                value={tab.value}
                className="flex flex-col flex-1 min-h-0 gap-0 mt-0"
              >
                <div className="pt-2 pb-3 border-b shrink-0 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-lg font-bold tracking-tight">
                      {tab.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tab.description}
                    </p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto py-4">
                  <Component />
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
