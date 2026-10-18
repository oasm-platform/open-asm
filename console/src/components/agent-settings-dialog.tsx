import LlmConnect from '@/pages/agents/components/llm-connect';
import { AgentsManager } from '@/components/agents-manager';
import { ConnectorsManager } from '@/components/connectors-manager';
import { InstructionManager } from '@/components/instruction-manager';
import { MemoryManager } from '@/components/memory-manager';
import { ModelsManager } from '@/components/models-manager';
import { SkillsManager } from '@/components/skills-manager';
import { WebSearchManager } from '@/components/web-search-manager';
import { SettingsHeaderActionsContext } from '@/components/settings-header-actions';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BookOpen,
  Bot,
  Brain,
  Cpu,
  Globe,
  KeyRound,
  Plug,
  ScrollText,
  X,
} from 'lucide-react';
import { useState, type ComponentType, type SVGProps } from 'react';
import {
  useAgentSettingsDialog,
  type AgentSettingsTab,
} from '@/hooks/useAgentSettingsDialog';

interface TabConfig {
  value: AgentSettingsTab;
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
    value: 'models',
    label: 'Models',
    description: 'Choose the models the agent uses',
    icon: Cpu,
    component: ModelsManager,
  },
  {
    value: 'agents',
    label: 'Agents',
    description:
      'Built-in agents and custom agents you can mention with @name',
    icon: Bot,
    component: AgentsManager,
  },
  {
    value: 'web-search',
    label: 'Web Search',
    description: 'Search provider the agent uses to browse the web',
    icon: Globe,
    component: WebSearchManager,
  },
  {
    value: 'instruction',
    label: 'Instruction',
    description: 'Custom instructions added to the agent system prompt',
    icon: ScrollText,
    component: InstructionManager,
  },
  {
    value: 'skills',
    label: 'Skills',
    description: 'Specialized instructions the agent can use to perform tasks',
    icon: BookOpen,
    component: SkillsManager,
  },
  {
    value: 'connectors',
    label: 'Connectors',
    description: 'Tools the agent can use in this workspace',
    icon: Plug,
    component: ConnectorsManager,
  },
  {
    value: 'memory',
    label: 'Memory',
    description: 'Long-term memory content used by the AI agent',
    icon: Brain,
    component: MemoryManager,
  },
];

const GROUP_LABEL = 'Agent settings';

const triggerClassName =
  'data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:after:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-10 w-full flex-none justify-start gap-3 rounded-lg px-3 text-sm font-medium border-0 shadow-none';

export function AgentSettingsDialog() {
  const {
    state: { isOpen, tab: activeTab },
    open,
    close,
  } = useAgentSettingsDialog();
  const active = tabs.find((tab) => tab.value === activeTab) ?? tabs[0];
  const ActiveIcon = active.icon;
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  return (
    <Dialog open={isOpen} onOpenChange={(next) => (next ? open(activeTab) : close())}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-none h-dvh rounded-none sm:rounded-none border-0 md:w-[calc(100%-2rem)] md:max-w-6xl md:h-[85vh] md:rounded-xl md:border flex flex-col gap-0 p-0 sm:p-0 overflow-hidden"
      >
        <DialogTitle className="sr-only">Agent Settings</DialogTitle>

        <Tabs
          value={activeTab}
          onValueChange={(value) => open(value)}
          orientation="vertical"
          className="flex flex-col md:flex-row flex-1 min-h-0 gap-0"
        >
          {/* Desktop: vertical side nav */}
          <div className="hidden md:flex md:flex-col w-64 shrink-0 border-r px-2.5 py-5 overflow-y-auto">
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {GROUP_LABEL}
            </p>
            <TabsList className="p-0 h-auto w-full flex-col items-stretch justify-start gap-0.5 rounded-none bg-transparent">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={triggerClassName}
                  >
                    <Icon className="size-4.5 shrink-0" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="flex flex-col flex-1 min-h-0 min-w-0">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 md:px-6 md:py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  {active.label}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {active.description}
                </p>
              </div>
              <div
                ref={setActionsSlot}
                className="flex shrink-0 items-center gap-2 empty:hidden"
              />
              <DialogClose className="shrink-0 rounded-xs opacity-70 transition-opacity hover:opacity-100 hover:cursor-pointer focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>

            {/* Mobile: section picker dropdown */}
            <div className="shrink-0 border-b px-4 py-3 md:hidden">
              <Select value={activeTab} onValueChange={(value) => open(value)}>
                <SelectTrigger className="w-full h-10" aria-label="Settings section">
                  <SelectValue>
                    <ActiveIcon />
                    {GROUP_LABEL} · {active.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="text-sm font-semibold text-foreground">
                      {GROUP_LABEL}
                    </SelectLabel>
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <SelectItem key={tab.value} value={tab.value} className="h-9">
                          <Icon />
                          {tab.label}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <SettingsHeaderActionsContext.Provider value={actionsSlot}>
              {tabs.map((tab) => {
                const Component = tab.component;
                return (
                  <TabsContent
                    key={tab.value}
                    value={tab.value}
                    className="flex-1 min-h-0 overflow-y-auto mt-0 px-4 py-4 md:px-6 md:py-5"
                  >
                    <Component />
                  </TabsContent>
                );
              })}
            </SettingsHeaderActionsContext.Provider>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
