import { useT } from '@/lib/i18n-dictionary';
import { useNavigate } from '@tanstack/react-router';
import { Check, ChevronDown, Maximize2, SquarePen, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAiChatConversation,
  useAiChatPanelOpen,
} from '@/hooks/useAiChatPanel';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { stripPageContextFromTitle } from '@/lib/page-context';
import { cn } from '@/lib/utils';
import { useAgentsControllerGetConversationsInfinite } from '@/services/apis/gen/queries';

interface AiChatPanelHeaderProps {
  conversationId?: string;
  /** Title loaded with the conversation, until the chats list has it */
  title?: string | null;
  /** The chat exists on the server, so AI Studio can open it */
  isSaved: boolean;
}

/**
 * Header of the AI chat panel: the chat's title, which switches to a recent
 * chat, and buttons for a new chat, opening it in AI Studio and closing.
 * Floats over the chat like AI Studio's: the messages scroll under it.
 */
export function AiChatPanelHeader({
  conversationId,
  title,
  isSaved,
}: AiChatPanelHeaderProps) {
  const t = useT();
  const untitled = t('components.aiChat.newConversation');
  const { newChat, openConversation } = useAiChatConversation();
  const { close } = useAiChatPanelOpen();
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [isListOpen, setIsListOpen] = useState(false);

  // The same list (and cache) as AI Studio's sidebar, so renames show here
  const { data, isLoading } = useAgentsControllerGetConversationsInfinite(
    { limit: 20, sortBy: 'updatedAt', sortOrder: 'DESC' },
    {
      query: {
        queryKey: ['/api/agents/conversations', 'infinite', selectedWorkspaceId],
        enabled: !!selectedWorkspaceId && isListOpen,
        getNextPageParam: (lastPage) =>
          lastPage.hasNextPage ? lastPage.page + 1 : undefined,
      },
    },
  );
  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );
  const listedTitle = conversations.find((c) => c.id === conversationId)?.title;
  const displayTitle =
    stripPageContextFromTitle(listedTitle || title || '') || untitled;

  const openInStudio = () => {
    close();
    if (isSaved && conversationId) {
      void navigate({
        to: '/aistudio/conversations/$conversationId',
        params: { conversationId },
      });
    } else {
      void navigate({ to: '/aistudio' });
    }
  };

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-2 bg-gradient-to-b from-background from-65% to-transparent px-3">
      <DropdownMenu modal={false} onOpenChange={setIsListOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-events-auto min-w-0 max-w-[65%] justify-start gap-1 px-2 font-semibold"
            title={displayTitle}
          >
            <span className="truncate">{displayTitle}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuItem onClick={newChat}>
            <SquarePen className="size-4" />
            {untitled}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t('components.aiChat.recent')}
          </DropdownMenuLabel>
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                {t('common.loading')}
              </p>
            ) : conversations.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                {t('components.aiChat.noConversations')}
              </p>
            ) : (
              conversations.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  title={stripPageContextFromTitle(c.title ?? '') || untitled}
                >
                  <span className="truncate">
                    {stripPageContextFromTitle(c.title ?? '') || untitled}
                  </span>
                  <Check
                    className={cn(
                      'ms-auto size-4 shrink-0',
                      c.id !== conversationId && 'invisible',
                    )}
                  />
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-0.5 text-muted-foreground">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={untitled}
          title={untitled}
          onClick={newChat}
        >
          <SquarePen />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('components.aiChat.openInStudio')}
          title={t('components.aiChat.openInStudio')}
          onClick={openInStudio}
        >
          <Maximize2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('components.aiChat.close')}
          title={t('components.aiChat.close')}
          onClick={close}
        >
          <X />
        </Button>
      </div>
    </header>
  );
}
