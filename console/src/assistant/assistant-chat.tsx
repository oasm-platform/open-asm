import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ChatHeader } from './components/chat-header';
import { ConversationTitle } from './components/conversation-title';
import { ChatMessages } from './components/chat-messages';
import { ChatInput } from './components/chat-input';
import { StreamingStatus } from './components/streaming-status';
import { useAssistant } from '@/hooks/use-assistant';
import type { AssistantChatProps } from './types/types';

export function AssistantChat({ onSendMessage }: AssistantChatProps) {
  const [open, setOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');

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
  } = useAssistant();

  // Debug logging
  useEffect(() => {
    console.log('🔍 Assistant Debug:', {
      sessionsCount: sessions.length,
      messagesCount: messages.length,
      currentConversationId,
      isStreaming,
    });
  }, [sessions, messages, currentConversationId, isStreaming]);

  // Find current session
  const currentSession = sessions.find(
    (s) =>
      s.id === currentConversationId ||
      s.conversationId === currentConversationId,
  );

  const handleSendMessage = async (text?: string) => {
    const messageText = typeof text === 'string' ? text : inputMessage;
    if (messageText.trim() === '') return;

    if (typeof text !== 'string') setInputMessage(''); // Clear input if sending typed message (handles Event object from button click)

    if (onSendMessage) {
      onSendMessage(messageText);
    }

    try {
      console.log('📤 Sending message:', messageText);
      // If no conversation is selected, create a new one
      const isNewConversation = !currentConversationId;
      await sendMessage(messageText, isNewConversation);
      console.log('✅ Message sent successfully');
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      // Optionally show error to user
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(); // Uses inputMessage
    }
  };

  const handleNewConversation = () => {
    console.log('🆕 Creating new conversation');
    createNewConversation();
  };

  const handleSelectSession = (sessionId: string) => {
    console.log('📂 Selecting conversation:', sessionId);
    selectConversation(sessionId);
  };

  const suggestions = [
    'What is the current system security status?',
    'Are there any high-risk vulnerabilities detected?',
    'How should I configure the WAF for better protection?',
    'Can you explain the results of the last scan?',
    'What specific security actions do you recommend now?',
  ];

  return (
    <>
      <Button
        variant="outline"
        className="relative gap-2"
        onClick={() => setOpen(true)}
      >
        <MessageCircle className="h-4 w-4" />
        <span className="hidden md:inline">Assistant</span>
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-500"></span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            'flex flex-col fixed gap-0 bg-background transition-all duration-300 ease-in-out',
            // Mobile: Full screen
            'inset-0 w-full h-full p-4 border-none shadow-none',
            // Desktop (sm+): Restore original floating sidebar styles
            'sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[calc(100%-2rem)] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl sm:shadow-xl sm:p-5 sm:border-l',
            '[&>button]:hidden', // Hide default Sheet close button
          )}
        >
          <div className="flex flex-col h-full">
            <ChatHeader
              onClose={() => setOpen(false)}
              sessions={sessions}
              currentSessionId={currentConversationId}
              onSelectSession={handleSelectSession}
              onCreateNewSession={handleNewConversation}
            />
            <SheetDescription className="sr-only">Description</SheetDescription>

            {/* Show conversation title with New Chat action */}
            {/* Show conversation title with New Chat action */}
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
              <div className="flex-1 flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
                <div className="mb-8 text-center space-y-2">
                  <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto text-primary mb-4">
                    <MessageCircle className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    I am OASM Security Assistant
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
                    How can I help you secure your infrastructure today?
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2.5 w-full max-w-sm">
                  {suggestions.map((s, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      className="justify-start h-auto py-3 px-4 text-left whitespace-normal shadow-sm hover:shadow-md hover:border-primary/50 hover:bg-primary/5 transition-all w-full rounded-xl border-dashed border-zinc-300 dark:border-zinc-700"
                      onClick={() => handleSendMessage(s)}
                    >
                      <span className="text-sm">{s}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <ChatMessages messages={messages} />
            )}

            {/* Show streaming status (thinking, tool usage, etc.) - Moved here */}
            {isStreaming && (
              <div className="px-4 py-2">
                <StreamingStatus
                  type={streamingStatus.type}
                  content={streamingStatus.content}
                />
              </div>
            )}

            <ChatInput
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              onSendMessage={handleSendMessage}
              isSending={isStreaming}
              onKeyPress={handleKeyPress}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
