import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PanelRightOpen } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useAgentsControllerGetConversationsInfinite } from '@/services/apis/gen/queries';

dayjs.extend(relativeTime);

const UNTITLED = 'New conversation';

interface ChatHeaderProps {
  conversationId?: string;
  /** Title loaded with the conversation, until the chats list has it */
  title: string | null;
  createdAt?: string | null;
  /** Opens the side panel; no button while it is open (it has its own close) */
  onOpenPanel?: () => void;
  /** Marks the button while something in the panel is running */
  hasActivity?: boolean;
}

/**
 * Header of an AI Studio conversation: its title on the left, a button on
 * the right that splits the view to open the side panel.
 */
export function ChatHeader({
  conversationId,
  title,
  createdAt,
  onOpenPanel,
  hasActivity = false,
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
    // Over the top of the chat: messages scroll on under it and fade out
    // into its gradient instead of running into the title. Only its
    // contents take clicks, so the messages around them stay selectable.
    // Mobile keeps the app header instead (it holds the sidebar trigger)
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden h-14 items-center gap-3 bg-gradient-to-b from-background from-65% to-transparent px-4 md:flex md:px-6">
      <div className="pointer-events-auto flex min-w-0 items-baseline gap-2">
        <h1
          className="truncate text-sm font-semibold tracking-tight"
          title={displayTitle}
        >
          {displayTitle}
        </h1>
        {createdAt && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            · {dayjs(createdAt).fromNow()}
          </span>
        )}
      </div>
      {/* Only large screens have room to split the view */}
      {onOpenPanel && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="pointer-events-auto relative ml-auto hidden shrink-0 text-muted-foreground hover:cursor-pointer lg:inline-flex"
          aria-label="Open side panel"
          title="Open side panel"
          onClick={onOpenPanel}
        >
          <PanelRightOpen />
          {hasActivity && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 size-1.5 animate-pulse rounded-full bg-sky-500"
            />
          )}
        </Button>
      )}
    </header>
  );
}
