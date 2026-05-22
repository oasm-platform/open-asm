import {
  AlertCircle,
  CheckIcon,
  ChevronDown,
  ChevronUp,
  Loader2,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import type { ToolCallState } from './tool-call-display';

export function RemoteExecuteTerminal({
  toolCall,
}: {
  toolCall: ToolCallState;
}) {
  const [expanded, setExpanded] = useState(true);

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

  const statusIcon = {
    pending: <Loader2 className="size-3.5 animate-spin text-yellow-500" />,
    executing: <Loader2 className="size-3.5 animate-spin text-yellow-500" />,
    completed: <CheckIcon className="size-3.5 text-green-500" />,
    error: <AlertCircle className="size-3.5 text-red-500" />,
  }[toolCall.status];

  const statusColor = {
    pending: 'text-yellow-500',
    executing: 'text-yellow-500',
    completed: 'text-green-500',
    error: 'text-red-500',
  }[toolCall.status];

  const statusText = {
    pending: 'Queued',
    executing: 'Running…',
    completed: 'Done',
    error: 'Failed',
  }[toolCall.status];

  return (
    <div className="rounded-lg border border-border/60 bg-[#0d1117] text-sm w-full max-w-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors w-full"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="size-3.5 text-green-500 shrink-0" />
          <span className="font-mono text-xs text-green-400 truncate">
            {command}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs ${statusColor}`}>{statusIcon}</span>
          <span className="text-xs text-muted-foreground">{statusText}</span>
          {expanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && terminalOutput && (
        <div className="border-t border-white/10 px-3 py-2">
          <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all max-h-64 overflow-y-auto scrollbar-hide">
            {terminalOutput}
          </pre>
        </div>
      )}
      {!terminalOutput && toolCall.status === 'executing' && (
        <div className="border-t border-white/10 px-3 py-2">
          <span className="text-xs font-mono text-muted-foreground animate-pulse">
            Waiting for output...
          </span>
        </div>
      )}
    </div>
  );
}
