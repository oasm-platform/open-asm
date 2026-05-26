import { useMemo } from 'react';
import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from '@/components/ai-elements/terminal';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import type { ToolCallState } from './tool-call-display';

export function RemoteExecuteTerminal({
  toolCall,
  streamEvents,
}: {
  toolCall: ToolCallState;
  streamEvents?: RemoteExecuteStreamEvent[];
}) {
  const command = String(
    toolCall.input?.command ||
      toolCall.input?.cmd ||
      (typeof toolCall.input === 'string' ? toolCall.input : ''),
  );

  const parseTerminalOutput = (output: unknown): string => {
    if (typeof output === 'string') return output;
    if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof obj.stdout === 'string' && obj.stdout) {
        parts.push(obj.stdout);
      }
      if (typeof obj.stderr === 'string' && obj.stderr) {
        parts.push(obj.stderr);
      }
      if (parts.length > 0) return parts.join('\n');
      return JSON.stringify(output, null, 2);
    }
    return '';
  };

  const liveOutput = useMemo(() => {
    if (!streamEvents || streamEvents.length === 0) {
      return '';
    }
    return streamEvents
      .filter((e) => e.type === 1 || e.type === 2)
      .map((e) => e.data)
      .join('');
  }, [streamEvents]);

  const exitEvent = useMemo(
    () => streamEvents?.find((e) => e.type === 3),
    [streamEvents],
  );

  const errorEvent = useMemo(
    () => streamEvents?.find((e) => e.type === 4),
    [streamEvents],
  );

  const isStreaming = !exitEvent && !errorEvent;

  const terminalOutput = liveOutput || parseTerminalOutput(toolCall.output);

  const displayContent = command
    ? `\u001b[32m$\u001b[0m ${command}\n${terminalOutput}`
    : terminalOutput;

  return (
    <Terminal
      output={displayContent}
      isStreaming={isStreaming}
      className="w-full max-w-2xl text-xs"
    >
      <TerminalHeader>
        <TerminalTitle>Terminal</TerminalTitle>
        <div className="flex items-center gap-1 ml-auto">
          <TerminalStatus />
          <TerminalActions>
            <TerminalCopyButton />
          </TerminalActions>
        </div>
      </TerminalHeader>
      <TerminalContent />
    </Terminal>
  );
}
