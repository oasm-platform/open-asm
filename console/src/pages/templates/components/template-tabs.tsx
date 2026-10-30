import { FileCode, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { TemplateTab } from '../hooks/use-template-tabs';

type Props = {
  tabs: TemplateTab[];
  activeId?: string;
  onSelect: (id: string) => void;
  onClose: (tab: TemplateTab) => void;
};

export function TemplateTabs({ tabs, activeId, onSelect, onClose }: Props) {
  if (!tabs.length) return null;
  return (
    <div role="tablist" className="flex overflow-x-auto border-b bg-background">
      {tabs.map((tab) => {
        const dirty = tab.content !== tab.savedContent;
        return (
          <div
            key={tab.id}
            className={cn(
              'flex items-center gap-1 border-r pl-3 pr-1 text-xs whitespace-nowrap',
              activeId === tab.id
                ? 'bg-muted'
                : 'bg-muted/40 hover:bg-muted/80',
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeId === tab.id}
              onClick={() => onSelect(tab.id)}
              className="flex items-center gap-1 py-2 outline-none focus-visible:underline"
            >
              <FileCode className="size-4" />
              <span className="max-w-[150px] truncate">{tab.name}</span>
              {dirty && (
                <span
                  role="img"
                  aria-label="Unsaved changes"
                  className="size-1.5 rounded-full bg-foreground"
                />
              )}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.name}`}
              onClick={() => onClose(tab)}
              className="rounded p-1 hover:bg-muted-foreground/20 focus-visible:ring-2 focus-visible:ring-ring outline-none"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
