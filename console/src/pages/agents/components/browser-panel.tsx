import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, LocateFixed } from 'lucide-react';
import { useMemo } from 'react';
import { SidePanelSection } from './side-panel-layout';
import type { ToolCallEntry } from './tool-call-history-panel';

/**
 * The page after a browser command, as the run streams it
 * (`data-browser-screenshot`). Live only: nothing stores it, so a reload
 * shows the next one.
 */
export interface LiveBrowserScreenshot {
  toolCallId: string;
  command: string;
  /** Base64 JPEG */
  image: string;
  /** The browser session (`b-<id>`) the command ran in */
  browserSessionId?: string;
  /** The subagent that ran the command; unset for the main agent */
  subagent?: { id: string; name: string };
  /** When this page received it */
  receivedAt?: number;
}

/** Sessions kept at once: a worker runs at most 8 browser sessions */
export const MAX_BROWSER_VIEWS = 8;

/** One view per browser session (or per agent, for a session it cannot tell) */
const viewKey = (shot: LiveBrowserScreenshot): string =>
  shot.browserSessionId ??
  (shot.subagent ? `subagent:${shot.subagent.id}` : 'main');

/**
 * The views with `shot` in place of its session's previous picture, or added
 * after the others. Past the cap, the view updated longest ago goes.
 */
export function mergeBrowserScreenshot(
  views: LiveBrowserScreenshot[],
  shot: LiveBrowserScreenshot,
): LiveBrowserScreenshot[] {
  const key = viewKey(shot);
  const index = views.findIndex((v) => viewKey(v) === key);
  const next =
    index >= 0
      ? views.map((v, i) => (i === index ? shot : v))
      : [...views, shot];
  if (next.length <= MAX_BROWSER_VIEWS) return next;
  let stalest = 0;
  next.forEach((v, i) => {
    if ((v.receivedAt ?? 0) < (next[stalest].receivedAt ?? 0)) stalest = i;
  });
  return next.filter((_, i) => i !== stalest);
}

const browserCommandOf = (entry: ToolCallEntry): string | null => {
  if (entry.toolName !== 'execute_remote_command') return null;
  const command = (entry.input as { command?: unknown } | undefined)?.command;
  return typeof command === 'string' && /^browser(\s|$)/.test(command)
    ? command
    : null;
};

/** The session a browser command names with `-s`, if any */
const sessionOfCommand = (command: string): string | undefined =>
  /(?:^|\s)-s\s+(b-\S+)/.exec(command)?.[1];

const isRunning = (entry: ToolCallEntry): boolean =>
  entry.status === 'executing' || entry.status === 'pending';

/**
 * A main agent browser command still running in the shown session, after
 * its screenshot, if any. Subagent commands are not in the chat.
 */
function runningBrowserCommand(
  toolCalls: ToolCallEntry[],
  shown: LiveBrowserScreenshot,
): string | null {
  if (shown.subagent) return null;
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    if (toolCalls[i].toolCallId === shown.toolCallId) return null;
    const command = browserCommandOf(toolCalls[i]);
    if (!command || !isRunning(toolCalls[i])) continue;
    // Without a known session, any of its commands may be the one
    if (
      !shown.browserSessionId ||
      sessionOfCommand(command) === shown.browserSessionId
    ) {
      return command;
    }
  }
  return null;
}

/** A main agent command opening a session no picture shows yet, if any */
function openingBrowserCommand(
  toolCalls: ToolCallEntry[],
  views: LiveBrowserScreenshot[],
): string | null {
  const shownIds = new Set(views.map((v) => v.toolCallId));
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const command = browserCommandOf(toolCalls[i]);
    if (
      command &&
      isRunning(toolCalls[i]) &&
      !shownIds.has(toolCalls[i].toolCallId) &&
      !sessionOfCommand(command)
    ) {
      return command;
    }
  }
  return null;
}

const shortSessionId = (id: string): string => id.slice(0, 10);

function RunningLabel() {
  return (
    <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
      <Loader2 className="size-3 animate-spin" />
      Running
    </span>
  );
}

function BrowserView({
  shot,
  running,
  latest,
  onSelectToolCall,
}: {
  shot: LiveBrowserScreenshot;
  running: string | null;
  /** The view that changed last, when there are several */
  latest: boolean;
  onSelectToolCall?: (toolCallId: string) => void;
}) {
  const src = useMemo(
    () => `data:image/jpeg;base64,${shot.image}`,
    [shot.image],
  );
  const agent = shot.subagent?.name ?? 'Main agent';

  return (
    <SidePanelSection
      title={agent}
      meta={
        <span className="flex items-center gap-2">
          {running && <RunningLabel />}
          {shot.browserSessionId && (
            <code
              className="font-mono text-[11px] text-muted-foreground"
              title={shot.browserSessionId}
            >
              {shortSessionId(shot.browserSessionId)}
            </code>
          )}
        </span>
      }
    >
      <div className="flex items-center gap-2 px-2">
        <code
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={running ?? shot.command}
        >
          {running ?? shot.command}
        </code>
        {onSelectToolCall && !shot.subagent && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:cursor-pointer"
            aria-label="Show in chat"
            title="Show in chat"
            onClick={() => onSelectToolCall(shot.toolCallId)}
          >
            <LocateFixed />
          </Button>
        )}
      </div>
      <div
        className={cn(
          'mx-2 overflow-hidden rounded-lg border bg-muted',
          latest && 'border-sky-500/60',
        )}
      >
        <img
          key={shot.toolCallId}
          src={src}
          alt={`Browser page of ${agent} after ${shot.command}`}
          className="block h-auto w-full animate-in fade-in-0 duration-200"
        />
      </div>
    </SidePanelSection>
  );
}

/**
 * The Browser tab: a live view of every browser session in the
 * conversation, the main agent's and its subagents', in the order they
 * started. Each command's screenshot replaces its session's previous one.
 */
export function BrowserPanel({
  screenshots,
  toolCalls,
  onSelectToolCall,
}: {
  screenshots: LiveBrowserScreenshot[];
  toolCalls: ToolCallEntry[];
  /** Scrolls the chat to the command that took the screenshot */
  onSelectToolCall?: (toolCallId: string) => void;
}) {
  const opening = openingBrowserCommand(toolCalls, screenshots);
  const latestAt = Math.max(...screenshots.map((s) => s.receivedAt ?? 0));

  return (
    <div className="space-y-6">
      {opening && (
        <SidePanelSection title="Main agent" meta={<RunningLabel />}>
          <code
            className="block truncate px-2 font-mono text-xs text-muted-foreground"
            title={opening}
          >
            {opening}
          </code>
        </SidePanelSection>
      )}
      {screenshots.map((shot) => (
        <BrowserView
          key={viewKey(shot)}
          shot={shot}
          running={runningBrowserCommand(toolCalls, shot)}
          latest={
            screenshots.length > 1 &&
            latestAt > 0 &&
            shot.receivedAt === latestAt
          }
          onSelectToolCall={onSelectToolCall}
        />
      ))}
    </div>
  );
}
