import { useEffect, useState } from 'react';
import { RemoteExecuteTerminal } from './remote-execute-terminal';

export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: unknown;
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ToolCallDisplay({ toolCall }: { toolCall: ToolCallState }) {
  const [hidden, setHidden] = useState(false);
  const [displayedChars, setDisplayedChars] = useState(0);
  const [shimmerPos, setShimmerPos] = useState(0);

  const formattedName = formatToolName(toolCall.toolName);
  const isRevealing = displayedChars < formattedName.length;

  useEffect(() => {
    if (toolCall.status === 'completed' || toolCall.status === 'error') {
      const timer = setTimeout(() => setHidden(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [toolCall.status]);

  useEffect(() => {
    if (isRevealing) {
      const timer = setTimeout(() => setDisplayedChars((c) => c + 1), 40);
      return () => clearTimeout(timer);
    }
  }, [isRevealing, displayedChars]);

  useEffect(() => {
    if (!isRevealing) {
      setShimmerPos(0);
      return;
    }
    let rafId: number;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      setShimmerPos((p) => (p + dt * 0.04) % 100);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isRevealing]);

  if (toolCall.toolName === 'execute_remote_command') {
    return <RemoteExecuteTerminal toolCall={toolCall} />;
  }

  if (hidden) return null;

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground italic">
      {isRevealing ? (
        <span
          className="bg-gradient-to-r from-gray-400 via-white to-gray-400 bg-clip-text text-transparent bg-[length:200%_100%]"
          style={{ backgroundPosition: `${100 - shimmerPos}% 0` }}
        >
          {formattedName.slice(0, displayedChars)}
        </span>
      ) : (
        <span>{formattedName}</span>
      )}
      …
    </div>
  );
}
