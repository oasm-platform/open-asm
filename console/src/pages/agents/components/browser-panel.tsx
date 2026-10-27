import { Button } from '@/components/ui/button';
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
}

const browserCommandOf = (entry: ToolCallEntry): string | null => {
  if (entry.toolName !== 'execute_remote_command') return null;
  const command = (entry.input as { command?: unknown } | undefined)?.command;
  return typeof command === 'string' && /^browser(\s|$)/.test(command)
    ? command
    : null;
};

/** A browser command still running after the shown screenshot, if any. */
function runningBrowserCommand(
  toolCalls: ToolCallEntry[],
  shown: LiveBrowserScreenshot,
): string | null {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    if (toolCalls[i].toolCallId === shown.toolCallId) return null;
    const command = browserCommandOf(toolCalls[i]);
    const { status } = toolCalls[i];
    if (command && (status === 'executing' || status === 'pending')) {
      return command;
    }
  }
  return null;
}

/**
 * The Browser tab: a live view of the page the agent drives. Each browser
 * command's screenshot replaces the previous one as it arrives.
 */
export function BrowserPanel({
  screenshot,
  toolCalls,
  onSelectToolCall,
}: {
  screenshot: LiveBrowserScreenshot;
  toolCalls: ToolCallEntry[];
  /** Scrolls the chat to the command that took the screenshot */
  onSelectToolCall?: (toolCallId: string) => void;
}) {
  const running = runningBrowserCommand(toolCalls, screenshot);
  const src = useMemo(
    () => `data:image/jpeg;base64,${screenshot.image}`,
    [screenshot.image],
  );

  return (
    <SidePanelSection
      title="Live view"
      meta={
        running && (
          <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
            <Loader2 className="size-3 animate-spin" />
            Running
          </span>
        )
      }
    >
      <div className="flex items-center gap-2 px-2">
        <code
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={running ?? screenshot.command}
        >
          {running ?? screenshot.command}
        </code>
        {onSelectToolCall && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:cursor-pointer"
            aria-label="Show in chat"
            title="Show in chat"
            onClick={() => onSelectToolCall(screenshot.toolCallId)}
          >
            <LocateFixed />
          </Button>
        )}
      </div>
      <div className="mx-2 overflow-hidden rounded-lg border bg-muted">
        <img
          key={screenshot.toolCallId}
          src={src}
          alt={`Browser page after ${screenshot.command}`}
          className="block h-auto w-full animate-in fade-in-0 duration-200"
        />
      </div>
    </SidePanelSection>
  );
}
