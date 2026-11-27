import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import { cn } from '@/lib/utils';
import type {
  ConversationMetadataDto,
  SubagentResponseDto,
} from '@/services/apis/gen/queries';
import type { UIMessage } from 'ai';
import {
  BarChart3,
  Globe,
  ListChecks,
  Network,
  PanelRightClose,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { AgentTodoPanel, type AgentTodoItem } from './agent-todo-panel';
import { AgentWorkflowPanel } from './agent-workflow-panel';
import { PanelTab, PanelTabStrip } from './panel-tab-strip';
import { BrowserPanel, type LiveBrowserScreenshot } from './browser-panel';
import { isSubagentActive, SubagentsPanel } from './subagents-panel';
import {
  extractToolCalls,
  ToolCallHistoryPanel,
} from './tool-call-history-panel';
import { TurnStatsPanel } from './turn-stats-panel';
import { useT } from '@/lib/i18n-dictionary';

export const SIDE_PANEL_TABS = [
  'plan',
  'workflow',
  'subagents',
  'browser',
  'tools',
  'stats',
] as const;
export type SidePanelTab = (typeof SIDE_PANEL_TABS)[number];

interface SidePanelData {
  todos?: AgentTodoItem[];
  goal?: string | null;
  subagents: SubagentResponseDto[];
  messages: UIMessage[];
  metadata: ConversationMetadataDto | null | undefined;
  /** Live view of each browser session, streamed by the current run */
  browserScreenshots?: LiveBrowserScreenshot[];
}

/** Stable default, so the memo below does not rerun on every render */
const NO_SCREENSHOTS: LiveBrowserScreenshot[] = [];

/** Which tabs have something to show, e.g. to pick one when the panel opens */
export function sidePanelContent({
  todos,
  goal,
  subagents,
  messages,
  metadata,
  browserScreenshots,
}: SidePanelData): Record<SidePanelTab, boolean> {
  return {
    plan: (todos?.length ?? 0) > 0 || !!goal,
    workflow: subagents.length > 0,
    subagents: subagents.length > 0,
    browser: (browserScreenshots?.length ?? 0) > 0,
    tools: extractToolCalls(messages).length > 0,
    stats: !!(metadata?.model || metadata?.lastTurn),
  };
}

/** Tab badge while something in that tab is still running */
const RUNNING_BADGE = 'bg-sky-500/10 text-sky-600 dark:text-sky-400';

function EmptyTab({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="rounded-xl bg-muted p-3 ring-1 ring-border">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

interface ChatSidePanelProps extends SidePanelData {
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  onClose: () => void;
  /** Lets a picked subagent load its transcript */
  conversationId?: string;
  /** A tool call picked in its tab, for the chat to scroll to */
  onSelectToolCall?: (toolCallId: string) => void;
  /** Live output of remote commands, by tool call id */
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
  className?: string;
}

/**
 * The half of a split AI Studio conversation beside the chat (full screen
 * over it below lg): the plan, the workflow of subagents, subagents, browser,
 * tool calls and turn stats, one tab at a time.
 */
export function ChatSidePanel({
  tab,
  onTabChange,
  onClose,
  todos,
  goal,
  subagents,
  messages,
  metadata,
  conversationId,
  onSelectToolCall,
  remoteExecuteEvents,
  browserScreenshots = NO_SCREENSHOTS,
  className,
}: ChatSidePanelProps) {
  const t = useT();
  const has = useMemo(
    () =>
      sidePanelContent({
        todos,
        goal,
        subagents,
        messages,
        metadata,
        browserScreenshots,
      }),
    [todos, goal, subagents, messages, metadata, browserScreenshots],
  );
  const completed = todos?.filter((t) => t.status === 'completed').length ?? 0;
  const running = subagents.filter(isSubagentActive).length;
  const toolCalls = useMemo(() => extractToolCalls(messages), [messages]);
  const planVersion = useMemo(
    () => (todos ?? []).map((t) => `${t.id}:${t.status}`).join(','),
    [todos],
  );
  const toolCallsRunning = toolCalls.filter(
    (t) => t.status === 'executing' || t.status === 'pending',
  ).length;
  const toolCallsDone = toolCalls.filter((t) => t.status === 'completed').length;
  // Same padding in every tab (see side-panel-layout): px-3 + a row's px-2
  // puts icons and text at the tab labels' x
  const contentClassName =
    'min-h-0 overflow-y-auto px-3 py-4 animate-in fade-in-0 duration-200';

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as SidePanelTab)}
      className={cn('min-h-0 gap-0', className)}
    >
      {/* Same height as the chat header beside it; the close button sits
          where the open button was. Tab labels vary a lot by language, so
          the tabs are icons and counts with only the selected one labelled
          (see PanelTabStrip) */}
      <div className="@container/tabs flex h-14 shrink-0 items-center gap-2 border-b pl-4 pr-3 @md/tabs:pl-5 md:pr-6">
        <PanelTabStrip value={tab} className="gap-3 @xl/tabs:gap-5">
          <PanelTab
            value="plan"
            active={tab === 'plan'}
            icon={ListChecks}
            label={t('agents.sidePanel.tabs.plan')}
            badge={todos?.length ? `${completed}/${todos.length}` : undefined}
          />
          <PanelTab
            value="workflow"
            active={tab === 'workflow'}
            icon={Workflow}
            label={t('agents.sidePanel.tabs.workflow')}
          />
          <PanelTab
            value="subagents"
            active={tab === 'subagents'}
            icon={Network}
            label={t('agents.sidePanel.tabs.subagents')}
            badge={
              subagents.length > 0 ? (running > 0 ? running : subagents.length) : undefined
            }
            badgeClassName={running > 0 ? RUNNING_BADGE : undefined}
          />
          <PanelTab
            value="browser"
            active={tab === 'browser'}
            icon={Globe}
            label={t('agents.sidePanel.tabs.browser')}
            badge={browserScreenshots.length > 1 ? browserScreenshots.length : undefined}
          />
          <PanelTab
            value="tools"
            active={tab === 'tools'}
            icon={Wrench}
            label={t('agents.sidePanel.tabs.tools')}
            badge={toolCalls.length > 0 ? `${toolCallsDone}/${toolCalls.length}` : undefined}
            badgeClassName={toolCallsRunning > 0 ? RUNNING_BADGE : undefined}
          />
          <PanelTab
            value="stats"
            active={tab === 'stats'}
            icon={BarChart3}
            label={t('agents.sidePanel.tabs.stats')}
          />
        </PanelTabStrip>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto shrink-0 text-muted-foreground hover:cursor-pointer"
          aria-label={t('agents.sidePanel.close')}
          title={t('agents.sidePanel.close')}
          onClick={onClose}
        >
          <PanelRightClose />
        </Button>
      </div>

      {/* The tab is the frame: collapsible={false} lays each section out
          for it (no card, nothing folds, the shared rows), full width */}
      <TabsContent value="plan" className={contentClassName}>
        {has.plan ? (
          <AgentTodoPanel todos={todos} goal={goal} collapsible={false} />
        ) : (
          <EmptyTab
            icon={ListChecks}
            title={t('agents.sidePanel.empty.planTitle')}
            description={t('agents.sidePanel.empty.planDescription')}
          />
        )}
      </TabsContent>
      <TabsContent value="workflow" className={contentClassName}>
        {has.workflow && conversationId ? (
          <AgentWorkflowPanel
            conversationId={conversationId}
            subagents={subagents}
            planVersion={planVersion}
          />
        ) : (
          <EmptyTab
            icon={Workflow}
            title={t('agents.sidePanel.empty.workflowTitle')}
            description={t('agents.sidePanel.empty.workflowDescription')}
          />
        )}
      </TabsContent>
      <TabsContent value="subagents" className={contentClassName}>
        {has.subagents ? (
          <SubagentsPanel
            subagents={subagents}
            conversationId={conversationId}
            collapsible={false}
          />
        ) : (
          <EmptyTab
            icon={Network}
            title={t('agents.sidePanel.empty.subagentsTitle')}
            description={t('agents.sidePanel.empty.subagentsDescription')}
          />
        )}
      </TabsContent>
      <TabsContent value="browser" className={contentClassName}>
        {has.browser ? (
          <BrowserPanel
            screenshots={browserScreenshots}
            toolCalls={toolCalls}
            onSelectToolCall={onSelectToolCall}
          />
        ) : (
          <EmptyTab
            icon={Globe}
            title={t('agents.sidePanel.empty.browserTitle')}
            description={t('agents.sidePanel.empty.browserDescription')}
          />
        )}
      </TabsContent>
      {/* The list scrolls itself (it follows new calls) and pads like the
          other tabs, so this tab only gives it the height */}
      <TabsContent
        value="tools"
        className="flex min-h-0 flex-col animate-in fade-in-0 duration-200"
      >
        {has.tools ? (
          <ToolCallHistoryPanel
            messages={messages}
            remoteExecuteEvents={remoteExecuteEvents}
            onSelectToolCall={onSelectToolCall}
            showHeader={false}
            className="flex-1"
          />
        ) : (
          <EmptyTab
            icon={Wrench}
            title={t('agents.sidePanel.empty.toolsTitle')}
            description={t('agents.sidePanel.empty.toolsDescription')}
          />
        )}
      </TabsContent>
      <TabsContent value="stats" className={contentClassName}>
        {has.stats ? (
          <TurnStatsPanel metadata={metadata} collapsible={false} />
        ) : (
          <EmptyTab
            icon={BarChart3}
            title={t('agents.sidePanel.empty.statsTitle')}
            description={t('agents.sidePanel.empty.statsDescription')}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
