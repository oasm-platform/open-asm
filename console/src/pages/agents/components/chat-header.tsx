import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Link } from '@tanstack/react-router';
import { MoreVertical, PanelRightOpen, SquarePen } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { cn } from '@/lib/utils';
import {
  SendMessageDtoAgentMode,
  useAgentsControllerGetConversationsInfinite,
} from '@/services/apis/gen/queries';

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
  /** Mode of this chat, for the new chat button to start one in it */
  agentMode?: string;
}

/**
 * Header of an AI Studio conversation: its title on the left, a button on
 * the right that opens the side panel (beside the chat on large screens,
 * full screen on smaller ones). Mobile swaps the title for a new chat button
 * beside that one.
 */
export function ChatHeader({
  conversationId,
  title,
  createdAt,
  onOpenPanel,
  hasActivity = false,
  agentMode,
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
  const isMobile = useIsMobile();

  return (
    // Over the top of the chat: messages scroll on under it and fade out
    // into its gradient instead of running into the title. Only its
    // contents take clicks, so the messages around them stay selectable.
    // Mobile shows no title (the layout's sidebar trigger floats at its left)
    // and no gradient: the messages show through, under see-through buttons
    <header
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-3 px-4 md:px-6',
        !isMobile &&
          'bg-gradient-to-b from-background from-65% to-transparent',
      )}
    >
      {!isMobile && (
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
      )}
      {/* Mobile wraps the buttons in one see-through chip, the same as the
          sidebar trigger's across from them (and as tall: size-8 + p-px +
          border = its size-9) */}
      <div
        className={cn(
          'pointer-events-auto ml-auto flex shrink-0 items-center gap-1',
          isMobile &&
            'gap-0.5 rounded-full border bg-background/60 p-px backdrop-blur-md',
        )}
      >
        {/* Mobile has no sidebar to start a chat from: a new one opens in
            the mode this one is in */}
        {isMobile && (
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-muted-foreground"
            aria-label="New chat"
            title="New chat"
          >
            <Link
              to={
                agentMode === SendMessageDtoAgentMode.agent
                  ? '/aistudio/agents'
                  : '/aistudio'
              }
            >
              <SquarePen className="size-5" />
            </Link>
          </Button>
        )}
        {onOpenPanel && (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              'relative text-muted-foreground hover:cursor-pointer',
              isMobile && 'rounded-full',
            )}
            aria-label="Open side panel"
            title="Open side panel"
            onClick={onOpenPanel}
          >
            {/* Mobile opens it full screen, not as a split: a menu-like icon */}
            {isMobile ? <MoreVertical className="size-5" /> : <PanelRightOpen />}
            {hasActivity && (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 size-1.5 animate-pulse rounded-full bg-sky-500"
              />
            )}
          </Button>
        )}
      </div>
    </header>
  );
}
