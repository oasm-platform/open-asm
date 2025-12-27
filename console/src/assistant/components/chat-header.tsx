import { Plus, HistoryIcon, Database, X, BotMessageSquare } from 'lucide-react';
import { SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useState, useCallback } from 'react';
import type { ChatHeaderProps } from '../types/types';
import { McpServerManager } from './mcp-server-manager';
import { ChatHistoryManager } from './chat-history';
import { LLMManager } from './llm-manager';

export function ChatHeader({
  title = 'AI Assistant',
  sessions = [],
  currentSessionId,
  onSelectSession,
  onCreateNewSession,
  onClose,
  deleteConversation,
  deleteAllConversations,
  search,
  setSearch,
  page,
  setPage,
  limit,
  totalCount,
  isLoadingConversations,
}: ChatHeaderProps) {
  const [isMcpManagerOpen, setIsMcpManagerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLLMManagerOpen, setIsLLMManagerOpen] = useState(false);

  const toggleHistory = useCallback(() => {
    setIsHistoryOpen((prev) => !prev);
  }, []);

  const handleOpenMcpManager = useCallback(() => {
    setIsMcpManagerOpen(true);
  }, []);

  const handleOpenLLMManager = useCallback(() => {
    setIsLLMManagerOpen(true);
  }, []);

  const handleNewChat = useCallback(() => {
    onCreateNewSession?.();
  }, [onCreateNewSession]);

  return (
    <div className="mb-1">
      <div className="flex items-center justify-between border-b pb-2 gap-2">
        <SheetTitle className="truncate">{title}</SheetTitle>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewChat}
            title="New Chat"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors duration-200"
          >
            <Plus className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenMcpManager}
            title="MCP Servers"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors duration-200"
          >
            <Database className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenLLMManager}
            title="LLM Manager"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors duration-200"
          >
            <BotMessageSquare className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleHistory}
            title="History"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors duration-200"
          >
            <HistoryIcon className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            title="Close"
            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-colors duration-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ChatHistoryManager
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => onSelectSession?.(id)}
        onCreateNewSession={() => onCreateNewSession?.()}
        deleteConversation={deleteConversation}
        deleteAllConversations={deleteAllConversations}
        search={search}
        setSearch={setSearch}
        page={page}
        setPage={setPage}
        limit={limit}
        totalCount={totalCount}
        isLoadingConversations={isLoadingConversations}
      />

      <McpServerManager
        open={isMcpManagerOpen}
        onOpenChange={setIsMcpManagerOpen}
      />

      <LLMManager open={isLLMManagerOpen} onOpenChange={setIsLLMManagerOpen} />
    </div>
  );
}
