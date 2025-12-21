import { Trash2, MessageCircle, Calendar } from 'lucide-react';
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
      <div
        className={cn(
          'h-10 w-10 flex-shrink-0 rounded-md flex items-center justify-center',
          isActive
            ? 'bg-primary/20 text-primary'
            : 'bg-muted text-muted-foreground',
        )}
      >
        <MessageCircle className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0 pr-8">
        <h4
          className={cn(
            'text-sm font-medium truncate',
            isActive ? 'text-primary' : 'text-foreground',
          )}
        >
          {session.title || 'Untitled Conversation'}
        </h4>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <Calendar className="h-3 w-3" />
          <span>{format(date, 'MMM d, yyyy • HH:mm')}</span>
        </div>
      </div>

      <div
        className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity"
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
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
