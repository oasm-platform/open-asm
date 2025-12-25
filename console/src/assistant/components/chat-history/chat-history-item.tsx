import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ChatSession } from '../../types/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ChatHistoryItemProps {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function ChatHistoryItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: ChatHistoryItemProps) {
  const date = session.createdAt ? new Date(session.createdAt) : new Date();

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer',
        isActive
          ? 'bg-secondary/50 border-primary/20'
          : 'bg-card border-transparent hover:bg-muted/50 hover:border-border',
      )}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h4
            className={cn(
              'text-sm font-medium truncate flex-1',
              isActive ? 'text-primary' : 'text-foreground',
            )}
          >
            {session.title || 'Untitled Conversation'}
          </h4>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap opacity-70">
            {format(date, 'MMM d, yyyy')}
          </span>
        </div>
        {session.description && (
          <p className="text-xs text-muted-foreground truncate line-clamp-1">
            {session.description}
          </p>
        )}
      </div>

      <div
        className="flex items-center opacity-40 hover:opacity-100 transition-opacity shrink-0 ml-2"
        onClick={(e) => e.stopPropagation()}
      >
        <ConfirmDialog
          title="Delete Conversation"
          description={`Are you sure you want to delete '${session.title}'?`}
          onConfirm={onDelete}
          confirmText="Delete"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />
      )}
    </div>
  );
}
