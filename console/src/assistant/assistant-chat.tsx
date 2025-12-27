import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription } from '@/components/ui/sheet';
import { useAssistant } from '@/hooks/use-assistant';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { ChatHeader } from './components/chat-header';
import { ChatInput } from './components/chat-input';
import { ChatMessages } from './components/chat-messages';
import { ConversationTitle } from './components/conversation-title';
import { ChatSuggestions } from './components/chat-suggestions';
import type { AssistantChatProps } from './types/types';
import { AgentType } from './types/agent-types';

export function AssistantChat({ onSendMessage }: AssistantChatProps) {
  const [open, setOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedAgentType, setSelectedAgentType] = useState<number>(
    AgentType.Analysis,
  );

  const isHealthy = true;

  const {
    sessions,
    messages,
    currentConversationId,
    isStreaming,
    streamingStatus,
    sendMessage,
    createNewConversation,
    selectConversation,
    updateConversation,
    deleteConversation,
    deleteAllConversations,
    search,
    setSearch,
    page,
    setPage,
    limit,
    totalCount,
    isLoadingConversations,
  } = useAssistant();

  // Find current session
  const currentSession = sessions.find((s) => s.id === currentConversationId);

  const handleSendMessage = async (text?: string) => {
    const messageText = typeof text === 'string' ? text : inputMessage;
    if (messageText.trim() === '') return;

    if (typeof text !== 'string') setInputMessage('');

    if (onSendMessage) {
      onSendMessage(messageText);
    }

    try {
      const isNewConversation = !currentConversationId;
      await sendMessage(messageText, isNewConversation, selectedAgentType);
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  };

  const handleNewConversation = () => {
    createNewConversation();
  };

  const handleSelectSession = (sessionId: string) => {
    selectConversation(sessionId);
  };

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        className="relative rounded-full md:rounded-lg w-10 h-10"
        onClick={() => setOpen(true)}
      >
        <MessageCircle
          className={cn('h-5 w-5', !isHealthy && 'text-red-500')}
        />
        {!isHealthy && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            'flex flex-col fixed gap-0 bg-black transition-all duration-300 ease-in-out',
            // Mobile: Full screen
            'inset-0 w-full h-full p-3 border-none shadow-none text-zinc-100',
            // Desktop (sm+): Restore original floating sidebar styles
            'sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[calc(100%-2rem)] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl sm:shadow-2xl sm:p-5 sm:border-l sm:border-zinc-900',
            '[&>button]:hidden', // Hide default Sheet close button
          )}
        >
          {!isHealthy && (
            <div className="bg-red-50 text-red-500 text-[10px] py-1 px-4 text-center border-b border-red-100 flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              AI Assistant is currently offline. Some features may not work.
            </div>
          )}
          <div className="flex flex-col h-full">
            <ChatHeader
              onClose={() => setOpen(false)}
              sessions={sessions}
              currentSessionId={currentConversationId}
              onSelectSession={handleSelectSession}
              onCreateNewSession={handleNewConversation}
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
            <SheetDescription className="sr-only">Description</SheetDescription>

            <ConversationTitle
              session={currentSession}
              onNewChat={handleNewConversation}
              onEditConversation={(newTitle, newDescription) => {
                if (currentSession?.id) {
                  updateConversation(
                    currentSession.id,
                    newTitle,
                    newDescription,
                  );
                }
              }}
            />

            {messages.length === 0 ? (
              <ChatSuggestions onSuggestionClick={handleSendMessage} />
            ) : (
              <ChatMessages messages={messages} />
            )}

            <ChatInput
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              onSendMessage={handleSendMessage}
              isSending={isStreaming}
              streamingStatus={isStreaming ? streamingStatus : undefined}
              selectedAgentType={selectedAgentType}
              onSelectAgentType={setSelectedAgentType}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
