'use client';

import { Image } from '@/components/ui/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckIcon, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ToolSelectorItem {
  id: string;
  name: string;
  logoUrl?: string | null;
}

/** Per-tool disabled state returned by getToolState. */
export interface ToolState {
  disabled: boolean;
  tooltip?: string;
}

interface ToolSelectorProps {
  tools: ToolSelectorItem[];
  /** Set of currently selected tool ids. */
  selectedIds: Set<string>;
  /** Called with a tool id each time it is toggled. */
  onToggle: (id: string) => void;
  /** Disables all interactions. */
  disabled?: boolean;
  /** Rendered when the tools list is empty. */
  emptyMessage?: string;
  /** Per-tool disabled/tooltip state. */
  getToolState?: (tool: ToolSelectorItem) => ToolState;
}

/**
 * Reusable selector for scanning tools (small circular logos). Used both when
 * creating an asset group and when managing a group's assigned tools.
 */
export function ToolSelector({
  tools,
  selectedIds,
  onToggle,
  disabled = false,
  emptyMessage = 'No scanning tools installed',
  getToolState,
}: ToolSelectorProps) {
  if (tools.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap gap-5">
        {tools.map((tool) => {
          const isSelected = selectedIds.has(tool.id);
          const toolState = getToolState?.(tool);
          const isDisabled = disabled || Boolean(toolState?.disabled);
          const tooltipText = toolState?.tooltip;

          const button = (
            <button
              key={tool.id}
              type="button"
              className={cn(
                'group flex cursor-pointer flex-col items-center gap-2',
                isDisabled && 'cursor-not-allowed opacity-50',
              )}
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) {
                  if (tooltipText) toast.info(tooltipText);
                  return;
                }
                onToggle(tool.id);
              }}
              aria-pressed={isSelected}
            >
              <div className="relative">
                <div
                  className={cn(
                    'transition-all duration-300',
                    !isSelected &&
                      'grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100',
                  )}
                >
                  <Image
                    url={tool.logoUrl}
                    width={40}
                    height={40}
                    className="rounded-full border-2 border-[var(--color-primary)]/40 group-hover:border-[var(--color-primary)]"
                  />
                </div>
                {!isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <Plus className="size-5 text-white" />
                  </div>
                )}
                {isSelected && (
                  <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#10b981]">
                    <CheckIcon className="size-3 text-white" />
                  </div>
                )}
              </div>
              <span className="text-center text-xs font-medium capitalize">
                {tool.name}
              </span>
            </button>
          );

          return tooltipText && isDisabled ? (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>
                <p>{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            button
          );
        })}
      </div>
    </TooltipProvider>
  );
}
