import { Button } from '@/components/ui/button';
import { useStudioTemplate } from '@/hooks/useStudioTemplate';
import { cn } from '@/lib/utils';
import { FileText, X } from 'lucide-react';

export function EditorTabs() {
  const { templates, activeId, setActiveId, removeTemplate } =
    useStudioTemplate();

  return (
    <div className="flex bg-background w-full border-b">
      <div className="flex overflow-x-auto">
        {templates.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'flex items-center gap-1 py-1 px-3 text-sm cursor-pointer whitespace-nowrap border-r',
              activeId === tab.id
                ? 'bg-muted'
                : 'bg-muted/40 hover:bg-muted/80',
            )}
            onClick={() => setActiveId(tab.id)}
          >
            <FileText className="size-4" />
            <span className="truncate max-w-[150px] text-xs">
              {tab.filename}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0.5 rounded-full hover:bg-muted-foreground/20"
              onClick={(e) => {
                e.stopPropagation();
                if (templates.length > 1) {
                  removeTemplate(tab.id);
                }
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
