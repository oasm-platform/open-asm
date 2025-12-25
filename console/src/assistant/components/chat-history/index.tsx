import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  History,
  Search,
  MessageSquare,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ChatSession } from '../../types/types';
import { ChatHistoryItem } from './chat-history-item';

interface ChatHistoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: ChatSession[];
  currentSessionId?: string;
  onSelectSession: (id: string) => void;
  onCreateNewSession: () => void;
  deleteConversation?: (id: string) => Promise<void>;
  deleteAllConversations?: () => Promise<void>;
  search?: string;
  setSearch?: (val: string) => void;
  page?: number;
  setPage?: (val: number | ((prev: number) => number)) => void;
  limit?: number;
  totalCount?: number;
  isLoadingConversations?: boolean;
}

export function ChatHistoryManager(props: ChatHistoryManagerProps) {
  const {
    open,
    onOpenChange,
    sessions,
    currentSessionId,
    onSelectSession,
    onCreateNewSession,
    deleteConversation,
    search: searchActive,
    setSearch,
    page = 1,
    setPage,
    limit = 10,
    totalCount = 0,
    isLoadingConversations,
  } = props;

  const [searchValue, setSearchValue] = useState(searchActive || '');

  // Debounce search update
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch?.(searchValue);
      setPage?.(1); // Reset to first page on search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue, setSearch, setPage]);

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation?.(id);
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border shadow-lg">
        <DialogHeader className="p-6 pr-12 border-b shrink-0 bg-background relative">
          <div className="flex flex-row items-start justify-between gap-4 text-left">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <History className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 min-w-0 items-start">
                <DialogTitle className="text-lg font-semibold truncate leading-none text-left">
                  Chat History
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground line-clamp-2 text-left">
                  Manage and search your previous conversations.
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onCreateNewSession();
                onOpenChange(false);
              }}
              className="gap-2 shrink-0 h-9"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Chat</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Search Header - Container is background color, Input is gray */}
        <div className="p-4 border-b shrink-0 bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Input
              placeholder="Search conversations..."
              className="pl-9 bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary h-10"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
            {isLoadingConversations && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
          <div className="p-4 space-y-2">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-4" />
                <h4 className="font-medium text-muted-foreground mb-1">
                  {searchValue ? 'No results found' : 'No conversations yet'}
                </h4>
                <p className="text-xs text-muted-foreground/70 transition-colors">
                  {searchValue
                    ? `Try a different search term.`
                    : 'Start a new chat to begin.'}
                </p>
              </div>
            ) : (
              <>
                {sessions.map((session) => (
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
              </>
            )}
          </div>
        </div>

        <div className="p-4 border-t shrink-0 bg-background flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            Showing {sessions.length} of {totalCount} conversations
            {totalPages > 1 && ` • Page ${page} of ${totalPages}`}
          </div>

          <div className="flex items-center gap-2">
            <ConfirmDialog
              title="Clear All Conversations"
              description="Are you sure you want to delete all conversations? This action cannot be undone."
              onConfirm={() => {
                props.deleteAllConversations?.();
                onOpenChange(false);
              }}
              confirmText="Clear All"
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive gap-2 h-9"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear All
                </Button>
              }
            />

            {totalPages > 1 && (
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoadingConversations}
                  onClick={() => setPage?.((p) => Math.max(1, p - 1))}
                  className="h-8 gap-1 px-3"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoadingConversations}
                  onClick={() => setPage?.((p) => Math.min(totalPages, p + 1))}
                  className="h-8 gap-1 px-3"
                >
                  Next
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
