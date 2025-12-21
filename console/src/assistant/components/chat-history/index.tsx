import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { History, Search, Trash2, MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAiAssistantControllerDeleteConversation,
  useAiAssistantControllerDeleteConversations,
  getAiAssistantControllerGetConversationsQueryKey,
} from '@/services/apis/gen/queries';
import { toast } from 'sonner';
import type { ChatSession } from '../../types/types';
import { ChatHistoryItem } from './chat-history-item';

interface ChatHistoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: ChatSession[];
  currentSessionId?: string;
  onSelectSession: (id: string) => void;
  onCreateNewSession: () => void;
}

export function ChatHistoryManager({
  open,
  onOpenChange,
  sessions,
  currentSessionId,
  onSelectSession,
  onCreateNewSession,
}: ChatHistoryManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const queryClient = useQueryClient();
  const deleteConversationMutation =
    useAiAssistantControllerDeleteConversation();
  const deleteAllConversationsMutation =
    useAiAssistantControllerDeleteConversations();

  const filteredSessions = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );

    if (!searchQuery) return sorted;

    return sorted.filter(
      (session) =>
        session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.description?.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [sessions, searchQuery]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversationMutation.mutateAsync({ id });
        queryClient.invalidateQueries({
          queryKey: getAiAssistantControllerGetConversationsQueryKey(),
        });
        toast.success('Conversation deleted');
        if (currentSessionId === id) {
          onCreateNewSession();
        }
      } catch {
        toast.error('Failed to delete conversation');
      }
    },
    [
      deleteConversationMutation,
      queryClient,
      currentSessionId,
      onCreateNewSession,
    ],
  );

  const handleDeleteAll = useCallback(async () => {
    try {
      await deleteAllConversationsMutation.mutateAsync();
      queryClient.invalidateQueries({
        queryKey: getAiAssistantControllerGetConversationsQueryKey(),
      });
      toast.success('All conversations cleared');
      onCreateNewSession();
      onOpenChange(false);
    } catch {
      toast.error('Failed to clear conversations');
    }
  }, [
    deleteAllConversationsMutation,
    queryClient,
    onCreateNewSession,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border shadow-lg">
        <DialogHeader className="p-6 border-b shrink-0 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                <History className="h-5 w-5 text-muted-foreground" />
                Chat History
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Manage and search your previous conversations.
              </DialogDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onCreateNewSession();
                onOpenChange(false);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
        </DialogHeader>

        <div className="p-4 border-b shrink-0 bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 border-border bg-background"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-4" />
                <h4 className="font-medium text-muted-foreground mb-1">
                  {searchQuery ? 'No results found' : 'No conversations yet'}
                </h4>
                <p className="text-xs text-muted-foreground/70 transition-colors">
                  {searchQuery
                    ? `Try a different search term.`
                    : 'Start a new chat to begin.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSessions.map((session) => (
                  <ChatHistoryItem
                    key={session.id}
                    session={session}
                    isActive={currentSessionId === session.id}
                    onSelect={() => {
                      onSelectSession(session.id);
                      onOpenChange(false);
                    }}
                    onDelete={() => handleDeleteConversation(session.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {sessions.length > 0 && (
          <div className="p-4 border-t shrink-0 bg-background flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {filteredSessions.length} out of {sessions.length}{' '}
              session(s)
            </span>

            <ConfirmDialog
              title="Clear All Conversations"
              description="Are you sure you want to delete all conversations? This action cannot be undone."
              onConfirm={handleDeleteAll}
              confirmText="Clear All"
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear All
                </Button>
              }
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
