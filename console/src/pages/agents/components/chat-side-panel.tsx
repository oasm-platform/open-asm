import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import { cn } from '@/lib/utils';
import type {
  AgentHttpRequestListItemDto,
  ConversationMetadataDto,
  SubagentResponseDto,
} from '@/services/apis/gen/queries';
import type { UIMessage } from 'ai';
import {
  ArrowLeftRight,
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
import { isErrorRequest } from './network/format';
import { NetworkPanel, type NetworkData } from './network/network-panel';
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
  'network',
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
  /** HTTP requests logged for the conversation so far */
  httpRequestCount?: number;
}

/** Stable defaults, so the memos below do not rerun on every render */
const NO_SCREENSHOTS: LiveBrowserScreenshot[] = [];
const NO_REQUESTS: AgentHttpRequestListItemDto[] = [];

/** Which tabs have something to show, e.g. to pick one when the panel opens */
export function sidePanelContent({
  todos,
  goal,
  subagents,
  messages,
  metadata,
  browserScreenshots,
  httpRequestCount,
}: SidePanelData): Record<SidePanelTab, boolean> {
  return {
    plan: (todos?.length ?? 0) > 0 || !!goal,
    workflow: subagents.length > 0,
    subagents: subagents.length > 0,
    browser: (browserScreenshots?.length ?? 0) > 0,
    tools: extractToolCalls(messages).length > 0,
    network: (httpRequestCount ?? 0) > 0,
    stats: !!(metadata?.model || metadata?.lastTurn),
  };
}

/** The Network tab's count, with a red dot when any request failed */
function NetworkBadge({ total, errors }: { total: number; errors: number }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1">
      {errors > 0 && (
        <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
      )}
      {total}
      {errors > 0 && (
        <span className="sr-only">
          {t('agents.network.errorCount', { count: errors })}
        </span>
      )}
    </span>
  );
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
  /** The conversation's HTTP requests, for the Network tab */
  network?: NetworkData;
  /** The Network tab shows only this tool call's requests */
  networkToolCallId?: string | null;
  onNetworkToolCallChange?: (toolCallId: string | null) => void;
  /** A change starts the Network tab over: its list, unfiltered by text */
  networkResetKey?: number;
  className?: string;
}

/**
 * The half of a split AI Studio conversation beside the chat (full screen
 * over it below lg): the plan, the workflow of subagents, subagents, browser,
 * tool calls, HTTP requests and turn stats, one tab at a time.
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
  network,
  networkToolCallId,
  onNetworkToolCallChange,
  networkResetKey = 0,
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
  const httpRequests = network?.requests ?? NO_REQUESTS;
  const httpErrors = useMemo(
    () => httpRequests.filter(isErrorRequest).length,
    [httpRequests],
  );
  const networkFilter = useMemo(() => {
    if (!networkToolCallId) return null;
    const input = toolCalls.find((c) => c.toolCallId === networkToolCallId)
      ?.input as { command?: unknown } | undefined;
    return {
      toolCallId: networkToolCallId,
      command:
        typeof input?.command === 'string'
          ? input.command
          : networkToolCallId.slice(0, 12),
    };
  }, [networkToolCallId, toolCalls]);
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
      <div className="@container/tabs flex h-14 shrink-0 items-center gap-2 border-b pl-3 pr-3 @md/tabs:pl-5 md:pr-6">
        <PanelTabStrip value={tab} className="gap-2 @md/tabs:gap-3 @xl/tabs:gap-5">
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
            value="network"
            active={tab === 'network'}
            icon={ArrowLeftRight}
            label={t('agents.sidePanel.tabs.network')}
            badge={
              httpRequests.length > 0 ? (
                <NetworkBadge total={httpRequests.length} errors={httpErrors} />
              ) : undefined
            }
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
      {/* The panel lays out its own toolbar, list and status bar */}
      <TabsContent
        value="network"
        className="flex min-h-0 flex-col animate-in fade-in-0 duration-200"
      >
        {network ? (
          // Nothing carries over to another conversation or a tool card's link
          <NetworkPanel
            key={`${conversationId ?? ''}:${networkResetKey}`}
            network={network}
            toolCallFilter={networkFilter}
            onClearToolCallFilter={() => onNetworkToolCallChange?.(null)}
            onShowInChat={onSelectToolCall}
          />
        ) : (
          <EmptyTab
            icon={ArrowLeftRight}
            title={t('agents.network.emptyTitle')}
            description={t('agents.network.emptyHint')}
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
