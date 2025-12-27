import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, Cpu } from 'lucide-react';
import type { LLMConfigResponseDto } from '@/services/apis/gen/queries';

interface DefaultLLMDisplayProps {
  configs: LLMConfigResponseDto[];
  onSelect: (provider: string) => void;
  preferredProvider?: string;
}

export function DefaultLLMDisplay({
  configs,
  onSelect,
  preferredProvider,
}: DefaultLLMDisplayProps) {
  const currentConfig =
    configs.find((c) => c.provider === preferredProvider) || configs[0];

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'group flex items-center gap-1.5 transition-all hover:opacity-80 outline-none p-1 -ml-1 rounded',
            )}
          >
            {currentConfig ? (
              <span className="text-[14px] font-medium text-zinc-600 dark:text-zinc-400">
                {currentConfig.provider}:
                <span className="text-zinc-900 dark:text-zinc-100 ml-0.5 font-bold">
                  {currentConfig.model}
                </span>
              </span>
            ) : (
              <span className="text-[14px] font-medium text-zinc-500 italic">
                No LLM Configured
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-72 p-2 shadow-2xl border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-xl bg-white/90 dark:bg-zinc-950/90"
        >
          <div className="px-2 py-1.5 text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" />
            Select Default Provider
          </div>
          <DropdownMenuSeparator className="my-1 opacity-50" />

          {configs.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-500">
              No providers configured yet.
            </div>
          ) : (
            configs.map((config) => (
              <DropdownMenuItem
                key={config.provider}
                onClick={() => onSelect(config.provider)}
                className={cn(
                  'cursor-pointer flex items-center justify-between py-2.5 px-3 rounded-lg transition-all',
                  preferredProvider === config.provider &&
                    'bg-zinc-100 dark:bg-zinc-900',
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold uppercase tracking-tight">
                    {config.provider}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Model: {config.model}
                  </span>
                </div>
                {preferredProvider === config.provider && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
