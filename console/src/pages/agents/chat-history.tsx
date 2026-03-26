import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { MessageSquarePlus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ConversationResponseDto } from '@/services/apis/gen/queries';

interface ChatHistoryProps {
  conversations: ConversationResponseDto[];
  activeConversationId: string | null;
  isLoading?: boolean;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (conversationId: string) => void;
}

/**
 * Chat history sidebar component displaying conversation list
 * Groups conversations by date and supports search and delete
 */
export function ChatHistory({
  conversations,
  activeConversationId,
  isLoading = false,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
}: ChatHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter((conv) =>
    (conv.title ?? 'New conversation')
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  );

  const groupedConversations = groupConversationsByDate(filteredConversations);

  return (
    <div className="flex flex-col h-full w-full bg-muted/30">
      <div className="p-3 space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onNewChat}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </Button>
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConversation(conv.id);
                          }}
                          className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                          aria-label={`Delete conversation: ${conv.title ?? 'New conversation'}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
