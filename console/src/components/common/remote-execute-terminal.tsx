import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from '@/components/ai-elements/terminal';
import { TerminalIcon } from 'lucide-react';
import type { ToolCallState } from './tool-call-display';

export function RemoteExecuteTerminal({
  toolCall,
}: {
  toolCall: ToolCallState;
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

  const terminalOutput = parseTerminalOutput(toolCall.output);
  const isStreaming =
    toolCall.status === 'pending' || toolCall.status === 'executing';

  // Prepend the command as a prompt line with green $ (e.g., $ command)
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
        <TerminalIcon className="size-4 text-zinc-400" />
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
