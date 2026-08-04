'use client';

import { Image } from '@/components/ui/image';
import { CheckIcon, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToolSelectorItem {
  id: string;
  name: string;
  logoUrl?: string | null;
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
}: ToolSelectorProps) {
  if (tools.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-wrap gap-5">
      {tools.map((tool) => {
        const isSelected = selectedIds.has(tool.id);
        return (
          <button
            key={tool.id}
            type="button"
            className={cn(
              'group flex cursor-pointer flex-col items-center gap-2',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            disabled={disabled}
            onClick={() => onToggle(tool.id)}
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
      })}
    </div>
  );
}
