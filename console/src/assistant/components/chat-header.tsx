import { Plus, HistoryIcon, Database, X, Trash2, Trash } from 'lucide-react';
import { SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useAssistant } from '@/hooks/use-assistant';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ChatHeaderProps } from '../types/types';

export function ChatHeader({
  title = 'AI Assistant',
  sessions = [],
  currentSessionId,
  onSelectSession,
  onCreateNewSession,
  onClose,
  showSidebar = false,
}: ChatHeaderProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(showSidebar);
  const [visibleCount, setVisibleCount] = useState(10);

  const { deleteConversation, deleteAllConversations } = useAssistant();

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Placeholder functions for MCP and other actions
  const handleAddMCP = () => {
    console.log('Add MCP clicked');
  };

  const handleDeleteConversation = async (conversationId: string) => {
    await deleteConversation(conversationId);
  };

  const handleDeleteAllConversations = async () => {
    await deleteAllConversations();
    setIsSidebarOpen(false); // Close the sidebar after deleting all
  };

  return (
    <div className="mb-1">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b pb-2">
        {/* Chat Title on the left */}
        <SheetTitle>{title}</SheetTitle>

        <div className="flex items-center gap-1">
          {/* New Chat Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onCreateNewSession?.();
              setIsSidebarOpen(false);
            }}
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>

          {/* Add MCP Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleAddMCP}
            title="Add MCP"
          >
            <Database className="h-4 w-4" />
          </Button>

          {/* Show Chat List Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            title="Show Chat List"
          >
            <HistoryIcon className="h-4 w-4" />
          </Button>

          {/* Close Button */}
          <Button variant="ghost" size="icon" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Collapsible sidebar - shown when toggled */}
      {/* Modal/Overlay for History */}
      {isSidebarOpen && (
        <>
          {/* Background overlay effect - even darker background */}
          <div
            className="fixed inset-0 z-40 bg-black/70"
            onClick={() => setIsSidebarOpen(false)}
          />

          <div className="absolute top-14 left-0 right-0 z-50 flex justify-center animate-in fade-in slide-in-from-top-5 duration-200 pointer-events-none">
            <div className="w-[95%] max-w-2xl bg-background/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl pointer-events-auto p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold ml-1">Chat History</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                {[...sessions]
                  .sort(
                    (a, b) =>
                      new Date(b.createdAt || 0).getTime() -
                      new Date(a.createdAt || 0).getTime(),
                  )
                  .slice(0, visibleCount)
                  .map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between group"
                    >
                      <ConfirmDialog
                        title="Delete Conversation"
                        description="Are you sure you want to delete this conversation? This action cannot be undone."
                        onConfirm={() => handleDeleteConversation(session.id)}
                        confirmText="Delete"
                        cancelText="Cancel"
                        trigger={
                          <Button
                            variant={
                              currentSessionId === session.id
                                ? 'secondary'
                                : 'ghost'
                            }
                            className={`flex-1 justify-between items-center h-auto py-2 px-3 rounded-lg min-w-0 ${
                              session.unread ? 'font-bold' : ''
                            }`}
                            onClick={() => {
                              onSelectSession?.(session.id);
                              setIsSidebarOpen(false);
                            }}
                          >
                            <span className="font-medium truncate mr-2 text-left flex-1 text-sm">
                              {session.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap opacity-70 flex-shrink-0 group-hover:hidden">
                              {session.createdAt
                                ? new Date(
                                    session.createdAt,
                                  ).toLocaleDateString('vi-VN', {
                                    day: '2-digit',
                                    month: '2-digit',
                                  })
                                : ''}
                            </span>
                            <span className="hidden text-[10px] text-red-500 whitespace-nowrap group-hover:flex items-center">
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </span>
                          </Button>
                        }
                      />
                    </div>
                  ))}

                {/* Clear All button at the bottom */}
                {sessions.length > 0 && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between group">
                      <ConfirmDialog
                        title="Clear All Conversations"
                        description="Are you sure you want to delete all conversations? This action cannot be undone."
                        onConfirm={handleDeleteAllConversations}
                        confirmText="Yes, Clear All"
                        cancelText="Cancel"
                        trigger={
                          <Button
                            variant="ghost"
                            className="flex-1 justify-between items-center h-auto py-2 px-3 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <span className="font-medium truncate mr-2 text-left flex-1 text-sm">
                              Clear All Conversations
                            </span>
                            <span className="text-[10px] text-red-500 whitespace-nowrap opacity-70 flex-shrink-0 group-hover:hidden">
                              {/* No date shown for Clear All */}
                            </span>
                            <span className="hidden text-[10px] text-red-500 whitespace-nowrap group-hover:flex items-center">
                              <Trash className="h-3 w-3 mr-1" />
                              Clear All
                            </span>
                          </Button>
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {sessions.length > visibleCount && (
                <Button
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
                  onClick={() => setVisibleCount((prev) => prev + 10)}
                >
                  Load more...
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
