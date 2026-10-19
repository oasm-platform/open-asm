import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ChartColumn } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { cn } from '@/lib/utils';
import { useAgentsControllerGetConversationsInfinite } from '@/services/apis/gen/queries';

dayjs.extend(relativeTime);

const UNTITLED = 'New conversation';

interface ChatHeaderProps {
  conversationId?: string;
  /** Title loaded with the conversation, until the chats list has it */
  title: string | null;
  createdAt?: string | null;
  /** Whether turn stats and tool call history show in the right sidebar */
  showStats: boolean;
  onToggleStats: () => void;
}

/**
 * Header of an AI Studio conversation: its title on the left, a button on
 * the right that shows or hides the turn stats.
 */
export function ChatHeader({
  conversationId,
  title,
  createdAt,
  showStats,
  onToggleStats,
}: ChatHeaderProps) {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  // Only reads the chats list the sidebar loads (never fetches it), so a
  // rename there shows here at once
  const { data } = useAgentsControllerGetConversationsInfinite(
    { limit: 20, sortBy: 'updatedAt', sortOrder: 'DESC' },
    {
      query: {
        queryKey: ['/api/agents/conversations', 'infinite', selectedWorkspaceId],
        enabled: false,
        getNextPageParam: (lastPage) =>
          lastPage.hasNextPage ? lastPage.page + 1 : undefined,
      },
    },
  );
  const listedTitle = useMemo(
    () =>
      data?.pages
        .flatMap((page) => page.data)
        .find((c) => c.id === conversationId)?.title,
    [data, conversationId],
  );
  const displayTitle = listedTitle || title || UNTITLED;

  return (
    // Transparent, over the top of the chat: messages scroll on under it.
    // Only its contents take clicks, so the messages around them stay
    // selectable. Mobile keeps the app header instead (it holds the
    // sidebar trigger)
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden h-14 items-center gap-3 px-4 md:flex md:px-6">
      <div className="pointer-events-auto flex min-w-0 items-baseline gap-2">
        <h1
          className="truncate text-sm font-semibold tracking-tight"
          title={displayTitle}
        >
          {displayTitle}
        </h1>
        {createdAt && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {dayjs(createdAt).fromNow()}
          </span>
        )}
      </div>
      {/* The stats live in the right sidebar, which only large screens show */}
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn(
          'pointer-events-auto ml-auto hidden shrink-0 text-muted-foreground hover:cursor-pointer lg:inline-flex',
          showStats && 'bg-accent text-accent-foreground',
        )}
        aria-label={showStats ? 'Hide stats' : 'Show stats'}
        aria-pressed={showStats}
        title={showStats ? 'Hide stats' : 'Show stats'}
        onClick={onToggleStats}
      >
        <ChartColumn />
      </Button>
    </header>
  );
}
