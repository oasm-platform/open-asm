import { Plus, HistoryIcon, Database, X } from 'lucide-react';
import { SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
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

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Placeholder functions for MCP and other actions
  const handleAddMCP = () => {
    console.log('Add MCP clicked');
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
      {/* Collapsible sidebar - shown when toggled */}
      {/* Modal/Overlay for History */}
      {isSidebarOpen && (
        <div className="absolute top-14 left-0 right-0 z-50 flex justify-center animate-in fade-in slide-in-from-top-5 duration-200 pointer-events-none">
          <div className="w-[95%] max-w-sm bg-background/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl pointer-events-auto p-4 flex flex-col gap-3">
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
                  <Button
                    key={session.id}
                    variant={
                      currentSessionId === session.id ? 'secondary' : 'ghost'
                    }
                    className={`w-full justify-between items-center h-auto py-2 px-3 rounded-lg ${
                      session.unread ? 'font-bold' : ''
                    }`}
                    onClick={() => {
                      onSelectSession?.(session.id);
                      setIsSidebarOpen(false);
                    }}
                  >
                    <span className="font-medium truncate mr-3 text-left flex-1 text-sm">
                      {session.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap opacity-70">
                      {session.createdAt
                        ? new Date(session.createdAt).toLocaleDateString(
                            'vi-VN',
                            { day: '2-digit', month: '2-digit' },
                          )
                        : ''}
                    </span>
                  </Button>
                ))}
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
      )}
    </div>
  );
}
