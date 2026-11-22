import LlmConnect from '@/pages/agents/components/llm-connect';
import { AgentsManager } from '@/components/agents-manager';
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
  ScrollText,
  X,
} from 'lucide-react';
import { useState, type ComponentType, type SVGProps } from 'react';
import {
  useAgentSettingsDialog,
  type AgentSettingsTab,
} from '@/hooks/useAgentSettingsDialog';
import { useT } from '@/lib/i18n-dictionary';

interface TabConfig {
  value: AgentSettingsTab;
  /** Dictionary keys of the tab name and its one-line summary */
  labelKey: string;
  descriptionKey: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  component: ComponentType;
}

const tabs: TabConfig[] = [
  {
    value: 'provider',
    labelKey: 'agents.settings.tabs.provider.label',
    descriptionKey: 'agents.settings.tabs.provider.description',
    icon: KeyRound,
    component: LlmConnect,
  },
  {
    value: 'models',
    labelKey: 'agents.settings.tabs.models.label',
    descriptionKey: 'agents.settings.tabs.models.description',
    icon: Cpu,
    component: ModelsManager,
  },
  {
    value: 'agents',
    labelKey: 'agents.settings.tabs.agents.label',
    descriptionKey: 'agents.settings.tabs.agents.description',
    icon: Bot,
    component: AgentsManager,
  },
  {
    value: 'web-search',
    labelKey: 'agents.settings.tabs.webSearch.label',
    descriptionKey: 'agents.settings.tabs.webSearch.description',
    icon: Globe,
    component: WebSearchManager,
  },
  {
    value: 'instruction',
    labelKey: 'agents.settings.tabs.instruction.label',
    descriptionKey: 'agents.settings.tabs.instruction.description',
    icon: ScrollText,
    component: InstructionManager,
  },
  {
    value: 'skills',
    labelKey: 'agents.settings.tabs.skills.label',
    descriptionKey: 'agents.settings.tabs.skills.description',
    icon: BookOpen,
    component: SkillsManager,
  },
  {
    value: 'memory',
    labelKey: 'agents.settings.tabs.memory.label',
    descriptionKey: 'agents.settings.tabs.memory.description',
    icon: Brain,
    component: MemoryManager,
  },
];

const triggerClassName =
  'data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-10 w-full flex-none justify-start gap-3 rounded-lg px-3 text-sm font-medium border-0 shadow-none';

export function AgentSettingsDialog() {
  const t = useT();
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
        <DialogTitle className="sr-only">
          {t('agents.settings.title')}
        </DialogTitle>

        <Tabs
          value={activeTab}
          onValueChange={(value) => open(value)}
          orientation="vertical"
          className="flex flex-col md:flex-row flex-1 min-h-0 gap-0"
        >
          {/* Desktop: vertical side nav */}
          <div className="hidden md:flex md:flex-col w-64 shrink-0 border-r px-2.5 py-5 overflow-y-auto">
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('agents.settings.group')}
            </p>
            <TabsList
              // The selected item is a filled row, not an underline
              indicator={false}
              className="p-0 h-auto w-full flex-col items-stretch justify-start gap-0.5 rounded-none bg-transparent"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={triggerClassName}
                  >
                    <Icon className="size-4.5 shrink-0" />
                    {t(tab.labelKey)}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="flex flex-col flex-1 min-h-0 min-w-0">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 md:px-6 md:py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  {t(active.labelKey)}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {t(active.descriptionKey)}
                </p>
              </div>
              <div
                ref={setActionsSlot}
                className="flex shrink-0 items-center gap-2 empty:hidden"
              />
              <DialogClose className="shrink-0 rounded-xs opacity-70 transition-opacity hover:opacity-100 hover:cursor-pointer focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden">
                <X className="size-4" />
                <span className="sr-only">{t('agents.settings.close')}</span>
              </DialogClose>
            </div>

            {/* Mobile: section picker dropdown */}
            <div className="shrink-0 border-b px-4 py-3 md:hidden">
              <Select value={activeTab} onValueChange={(value) => open(value)}>
                <SelectTrigger className="w-full h-10" aria-label={t('agents.settings.section')}>
                  <SelectValue>
                    <ActiveIcon />
                    {t('agents.settings.group')} · {t(active.labelKey)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="text-sm font-semibold text-foreground">
                      {t('agents.settings.group')}
                    </SelectLabel>
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <SelectItem key={tab.value} value={tab.value} className="h-9">
                          <Icon />
                          {t(tab.labelKey)}
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
