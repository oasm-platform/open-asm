import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatSidebarProps } from '@/assistant/types/types';

export function ChatSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onCreateNewSession,
}: ChatSidebarProps) {
  return (
    <div className="w-64 border-r flex flex-col">
      <div className="p-3 border-b">
        <Button onClick={onCreateNewSession} className="w-full">
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sessions.map((session) => (
            <Button
              key={session.id}
              variant={currentSessionId === session.id ? 'secondary' : 'ghost'}
              className={`w-full mb-1 justify-start ${session.unread ? 'font-bold' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="truncate">
                <div className="font-medium">{session.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {session.lastMessage}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
