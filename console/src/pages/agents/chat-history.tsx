import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ConversationResponseDto } from '@/services/apis/gen/queries';
import { MessageSquarePlus, Pencil, Search, Trash2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

interface ChatHistoryProps {
  conversations: ConversationResponseDto[];
  activeConversationId: string | null;
  isLoading?: boolean;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (conversationId: string) => void;
  onDeleteAllConversations?: () => void;
  onRenameConversation?: (conversationId: string, newTitle: string) => void;
}

/**
 * Chat history sidebar component displaying conversation list
 * Groups conversations by date and supports search, rename, and delete
 */
export function ChatHistory({
  conversations,
  activeConversationId,
  isLoading = false,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onDeleteAllConversations,
  onRenameConversation,
}: ChatHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredConversations = conversations.filter((conv) =>
    (conv.title ?? 'New conversation')
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  );

  const groupedConversations = groupConversationsByDate(filteredConversations);

  const startEditing = useCallback(
    (e: React.MouseEvent, conv: ConversationResponseDto) => {
      e.stopPropagation();
      setEditingId(conv.id);
      setEditingTitle(conv.title ?? 'New conversation');
      setTimeout(() => inputRef.current?.select(), 0);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (editingId && editingTitle.trim() && onRenameConversation) {
      onRenameConversation(editingId, editingTitle.trim());
    }
    setEditingId(null);
  }, [editingId, editingTitle, onRenameConversation]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commitRename();
      if (e.key === 'Escape') setEditingId(null);
    },
    [commitRename],
  );

  return (
    <div className="flex flex-col h-full w-full bg-muted/30">
      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 justify-start gap-2"
            onClick={onNewChat}
          >
            <MessageSquarePlus className="h-4 w-4" />
            New Chat
          </Button>

          {conversations.length > 0 && onDeleteAllConversations && (
            <ConfirmDialog
              title="Delete all conversations"
              description="Are you sure you want to delete all conversations? This action cannot be undone."
              onConfirm={onDeleteAllConversations}
              confirmText="Delete all"
              trigger={
                <Button variant="outline" size="icon" className="shrink-0" title="Clear all history">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              }
            />
          )}
        </div>
        
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Loading conversations...
            </p>
          )}
          {!isLoading &&
            Object.entries(groupedConversations).map(
              ([group, groupConversations]) => (
                <div key={group}>
                  <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {groupConversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={cn(
                          'group flex items-center gap-1 rounded-md transition-colors',
                          activeConversationId === conv.id
                            ? 'bg-accent'
                            : 'hover:bg-accent/50',
                        )}
                      >
                        {editingId === conv.id ? (
                          <div className="flex-1 px-2 py-1.5 flex items-center">
                            <input
                              ref={inputRef}
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={handleRenameKeyDown}
                              className="w-full bg-background border border-input rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => onSelectConversation(conv.id)}
                              className={cn(
                                'flex-1 text-left px-3 py-2 text-sm truncate',
                                activeConversationId === conv.id
                                  ? 'text-accent-foreground'
                                  : 'text-muted-foreground',
                              )}
                              title={conv.title ?? 'New conversation'}
                            >
                              {conv.title ?? 'New conversation'}
                            </button>
                            
                            <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0 pr-1 transition-all">
                              {onRenameConversation && (
                                <button
                                  onClick={(e) => startEditing(e, conv)}
                                  className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
                                  title="Rename conversation"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              
                              <ConfirmDialog
                                title="Delete conversation"
                                description="Are you sure you want to delete this conversation? This action cannot be undone."
                                onConfirm={() => onDeleteConversation(conv.id)}
                                confirmText="Delete"
                                trigger={
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                                    title="Delete conversation"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                }
                              />
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ),
            )}
          {!isLoading && filteredConversations.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No chats found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Groups conversations by date relative to current time
 * Categories: Today, Yesterday, Last 7 days, Older
 */
function groupConversationsByDate(
  conversations: ConversationResponseDto[],
): Record<string, ConversationResponseDto[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups: Record<string, ConversationResponseDto[]> = {
    Today: [],
    Yesterday: [],
    'Last 7 days': [],
    Older: [],
  };

  for (const conv of conversations) {
    const convDate = new Date(conv.updatedAt);
    if (convDate >= today) {
      groups['Today'].push(conv);
    } else if (convDate >= yesterday) {
      groups['Yesterday'].push(conv);
    } else if (convDate >= lastWeek) {
      groups['Last 7 days'].push(conv);
    } else {
      groups['Older'].push(conv);
    }
  }

  return Object.fromEntries(
    Object.entries(groups).filter(([, v]) => v.length > 0),
  );
}
