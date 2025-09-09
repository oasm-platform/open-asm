import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileText, X } from 'lucide-react';

export interface Tab {
  id: string;
  name: string;
}

interface EditorTabsProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
}

export function EditorTabs({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
}: EditorTabsProps) {
  return (
    <div className="flex bg-background w-full border-b">
      <div className="flex overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'flex items-center gap-1 py-1 px-3 text-sm cursor-pointer whitespace-nowrap border-r',
              activeTabId === tab.id
                ? 'bg-muted'
                : 'bg-muted/40 hover:bg-muted/80',
            )}
            onClick={() => onTabClick(tab.id)}
          >
            <FileText className="size-4" />
            <span className="truncate max-w-[150px] text-xs">{tab.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0.5 rounded-full hover:bg-muted-foreground/20"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
            >
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
