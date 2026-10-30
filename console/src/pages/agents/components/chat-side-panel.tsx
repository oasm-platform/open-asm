import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { AgentTodoPanel, type AgentTodoItem } from './agent-todo-panel';
import { BrowserPanel, type LiveBrowserScreenshot } from './browser-panel';
import { isSubagentActive, SubagentsPanel } from './subagents-panel';
import {
  extractToolCalls,
  ToolCallHistoryPanel,
} from './tool-call-history-panel';
import { TurnStatsPanel } from './turn-stats-panel';

export const SIDE_PANEL_TABS = [
  'plan',
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
    subagents: subagents.length > 0,
    browser: (browserScreenshots?.length ?? 0) > 0,
    tools: extractToolCalls(messages).length > 0,
    stats: !!(metadata?.model || metadata?.lastTurn),
  };
}

/** Hidden below xl, where the narrow panel shows only icons and counts */
function TabLabel({ children }: { children: ReactNode }) {
  return <span className="sr-only xl:not-sr-only">{children}</span>;
}

function TabCount({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums',
        active
          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

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
 * over it below lg): the plan, subagents, browser, tool calls and turn
 * stats, one tab at a time.
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
          where the open button was. Below xl the panel is narrow: the tabs
          show only their icon and count (the label stays for screen
          readers and the tooltip), and scroll rather than push the button
          out */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b pl-5 pr-4 md:pr-6">
        <TabsList className="no-scrollbar h-full min-w-0 justify-start gap-4 overflow-x-auto xl:gap-6">
          <TabsTrigger value="plan" title="Plan">
            <ListChecks />
            <TabLabel>Plan</TabLabel>
            {!!todos?.length && (
              <TabCount>
                {completed}/{todos.length}
              </TabCount>
            )}
          </TabsTrigger>
          <TabsTrigger value="subagents" title="Subagents">
            <Network />
            <TabLabel>Subagents</TabLabel>
            {subagents.length > 0 && (
              <TabCount active={running > 0}>
                {running > 0 ? running : subagents.length}
              </TabCount>
            )}
          </TabsTrigger>
          <TabsTrigger value="browser" title="Browser">
            <Globe />
            <TabLabel>Browser</TabLabel>
            {browserScreenshots.length > 1 && (
              <TabCount>{browserScreenshots.length}</TabCount>
            )}
          </TabsTrigger>
          <TabsTrigger value="tools" title="Tool calls">
            <Wrench />
            <TabLabel>Tool calls</TabLabel>
            {toolCalls.length > 0 && (
              <TabCount active={toolCallsRunning > 0}>
                {toolCallsDone}/{toolCalls.length}
              </TabCount>
            )}
          </TabsTrigger>
          <TabsTrigger value="stats" title="Stats">
            <BarChart3 />
            <TabLabel>Stats</TabLabel>
          </TabsTrigger>
        </TabsList>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto shrink-0 text-muted-foreground hover:cursor-pointer"
          aria-label="Close side panel"
          title="Close side panel"
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
            title="No plan yet"
            description="The agent writes its plan here when a task takes several steps."
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
            title="No subagents"
            description="Background agents started in this conversation show up here."
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
            title="No live view yet"
            description="While the agent drives the browser, the page after each command shows up here."
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
            title="No tool calls yet"
            description="Tools the agent runs show up here. Pick one to jump to it in the chat."
          />
        )}
      </TabsContent>
      <TabsContent value="stats" className={contentClassName}>
        {has.stats ? (
          <TurnStatsPanel metadata={metadata} collapsible={false} />
        ) : (
          <EmptyTab
            icon={BarChart3}
            title="No stats yet"
            description="Context usage and turn stats appear after the first answer."
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
