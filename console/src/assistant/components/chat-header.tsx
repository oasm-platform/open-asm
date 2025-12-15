import {
  Plus,
  HistoryIcon,
  Database,
  X,
  Trash2,
  Trash,
  MessageSquare,
} from 'lucide-react';
import { SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useState, useCallback, useMemo } from 'react';
import { useAssistant } from '@/hooks/use-assistant';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ChatHeaderProps } from '../types/types';
import { McpServerManager } from './mcp-server-manager';

export function ChatHeader({
  title = 'AI Assistant',
  sessions = [],
  currentSessionId,
  onSelectSession,
  onCreateNewSession,
  onClose,
  showSidebar = false,
}: ChatHeaderProps) {
  const [isMcpManagerOpen, setIsMcpManagerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(showSidebar);
  const [visibleCount, setVisibleCount] = useState(10);

  const { deleteConversation, deleteAllConversations } = useAssistant();

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleOpenMcpManager = useCallback(() => {
    setIsMcpManagerOpen(true);
  }, []);

  const handleNewChat = useCallback(() => {
    onCreateNewSession?.();
    setIsSidebarOpen(false);
  }, [onCreateNewSession]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      onSelectSession?.(sessionId);
      setIsSidebarOpen(false);
    },
    [onSelectSession],
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      await deleteConversation(conversationId);
    },
    [deleteConversation],
  );

  const handleDeleteAllConversations = useCallback(async () => {
    await deleteAllConversations();
    setIsSidebarOpen(false);
  }, [deleteAllConversations]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + 10);
  }, []);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      ),
    [sessions],
  );

  const visibleSessions = useMemo(
    () => sortedSessions.slice(0, visibleCount),
    [sortedSessions, visibleCount],
  );

  const hasMoreSessions = sessions.length > visibleCount;
  const hasSessions = sessions.length > 0;

  return (
    <div className="mb-1">
      <div className="flex items-center justify-between border-b pb-2">
        <SheetTitle>{title}</SheetTitle>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewChat}
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenMcpManager}
            title="Add MCP"
          >
            <Database className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            title="Show Chat List"
          >
            <HistoryIcon className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70"
            onClick={closeSidebar}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200 pointer-events-none p-4 sm:p-6">
            <div className="w-full max-w-4xl bg-background/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl pointer-events-auto p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold ml-1">Chat History</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={closeSidebar}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-1 max-h-[70vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                {!hasSessions ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-sm">
                      No conversations yet
                    </p>
                    <p className="text-muted-foreground/70 text-xs mt-1">
                      Start a new chat to begin
                    </p>
                  </div>
                ) : (
                  <>
                    {visibleSessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between group"
                      >
                        <Button
                          variant={
                            currentSessionId === session.id
                              ? 'secondary'
                              : 'ghost'
                          }
                          className={`flex-1 justify-between items-center h-auto py-2 px-3 rounded-lg min-w-0 ${
                            session.unread ? 'font-bold' : ''
                          }`}
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <span className="font-medium truncate mr-2 text-left flex-1 text-sm">
                            {session.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap opacity-70 flex-shrink-0 group-hover:hidden">
                            {session.createdAt
                              ? new Date(session.createdAt).toLocaleDateString(
                                  undefined,
                                  {
                                    day: '2-digit',
                                    month: '2-digit',
                                  },
                                )
                              : ''}
                          </span>
                          <span className="hidden text-[10px] text-red-500 whitespace-nowrap group-hover:flex items-center">
                            <ConfirmDialog
                              title="Delete Conversation"
                              description="Are you sure you want to delete this conversation? This action cannot be undone."
                              onConfirm={() =>
                                handleDeleteConversation(session.id)
                              }
                              confirmText="Delete"
                              cancelText="Cancel"
                              trigger={
                                <span className="cursor-pointer flex items-center">
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </span>
                              }
                            />
                          </span>
                        </Button>
                      </div>
                    ))}

                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <div className="flex items-center justify-between group">
                        <Button
                          variant="ghost"
                          className="flex-1 justify-between items-center h-auto py-2 px-3 rounded-lg text-foreground hover:text-red-500"
                        >
                          <span className="font-medium truncate mr-2 text-left flex-1 text-sm">
                            Clear All Conversations
                          </span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap opacity-70 flex-shrink-0 group-hover:hidden" />
                          <span className="hidden text-[10px] text-red-500 whitespace-nowrap group-hover:flex items-center">
                            <ConfirmDialog
                              title="Clear All Conversations"
                              description="Are you sure you want to delete all conversations? This action cannot be undone."
                              onConfirm={handleDeleteAllConversations}
                              confirmText="Yes, Clear All"
                              cancelText="Cancel"
                              trigger={
                                <span className="cursor-pointer flex items-center">
                                  <Trash className="h-3 w-3 mr-1" />
                                  Clear All
                                </span>
                              }
                            />
                          </span>
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {hasMoreSessions && (
                <Button
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
                  onClick={handleLoadMore}
                >
                  Load more...
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <McpServerManager
        open={isMcpManagerOpen}
        onOpenChange={setIsMcpManagerOpen}
      />
    </div>
  );
}
