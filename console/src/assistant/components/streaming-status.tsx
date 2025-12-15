import { Loader2, Wrench, CheckCircle2, Brain } from 'lucide-react';

interface StreamingStatusProps {
  type?: string;
  content?: string;
}

export function StreamingStatus({ type, content }: StreamingStatusProps) {
  if (!type) return null;

  // Parse content if it's JSON
  let parsedContent: Record<string, unknown> = {};
  try {
    if (content) {
      parsedContent = JSON.parse(content);
    }
  } catch {
    // Not JSON, ignore
  }

  const renderStatus = () => {
    switch (type) {
      case 'thinking':
        return (
          <div className="flex items-center gap-3 text-sm text-zinc-300 bg-zinc-950 border border-white/10 px-4 py-2.5 rounded-full shadow-sm backdrop-blur-sm animate-pulse">
            <div className="relative">
              <Brain className="h-4 w-4 text-zinc-400" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
              </span>
            </div>
            <span className="font-medium">Thinking...</span>
          </div>
        );

      case 'tool_start': {
        const toolName =
          typeof parsedContent.tool_name === 'string'
            ? parsedContent.tool_name
            : typeof parsedContent.name === 'string'
              ? parsedContent.name
              : 'Unknown';

        const params = parsedContent.parameters as
          | Record<string, unknown>
          | undefined;
        const paramStr =
          params && Object.keys(params).length > 0
            ? JSON.stringify(params).slice(0, 60) +
              (JSON.stringify(params).length > 60 ? '...' : '')
            : '';

        return (
          <div className="flex flex-col gap-1.5 text-sm text-zinc-300 bg-zinc-950 border border-white/10 px-4 py-3 rounded-2xl shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-zinc-900 rounded-md border border-white/5">
                <Wrench className="h-4 w-4 animate-spin-slow text-amber-500" />
              </div>
              <span className="font-semibold text-zinc-200">
                Using tool: {toolName}
              </span>
            </div>
            {paramStr && (
              <div className="ml-8 text-xs font-mono text-zinc-500 bg-zinc-900/50 px-2 py-1 rounded border border-white/5 overflow-hidden text-ellipsis whitespace-nowrap">
                {paramStr}
              </div>
            )}
          </div>
        );
      }

      case 'tool_output':
        return (
          <div className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-950 border border-white/10 px-4 py-2.5 rounded-full shadow-sm backdrop-blur-sm">
            <div className="p-0.5 bg-zinc-900 rounded-full">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="font-medium">Tool completed</span>
          </div>
        );

      case 'tool_end':
        return (
          <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-950 border border-white/10 px-4 py-2.5 rounded-full shadow-sm backdrop-blur-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span>Tool finished</span>
          </div>
        );

      case 'state': {
        const stateText =
          typeof parsedContent.state === 'string'
            ? parsedContent.state
            : typeof parsedContent.message === 'string'
              ? parsedContent.message
              : 'Processing...';
        return (
          <div className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-950 border border-white/10 px-4 py-2.5 rounded-full shadow-sm backdrop-blur-sm">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
            <span className="font-medium">{stateText}</span>
          </div>
        );
      }

      case 'delta':
        return null;

      case 'message_start':
        return (
          <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-950 border border-white/10 px-4 py-2.5 rounded-full">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        );

      case 'message_end':
      case 'done':
        return null;

      default:
        return null;
    }
  };

  const status = renderStatus();
  if (!status) return null;

  return (
    <div className="mb-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {status}
    </div>
  );
}
