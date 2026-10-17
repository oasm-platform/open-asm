import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
  Bot,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plug,
  Settings,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAgentSettingsDialog } from '@/hooks/useAgentSettingsDialog';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useAgentsControllerDeleteAllConversations,
  useAgentsControllerDeleteConversation,
  useAgentsControllerGetConversationsInfinite,
  useAgentsControllerUpdateConversation,
} from '@/services/apis/gen/queries';
import { AppSidebar } from './menu-bar';

const CONVERSATION_PATH_PREFIX = '/aistudio/conversations/';
const UNTITLED = 'New conversation';

const itemClassName =
  'h-8 rounded-lg text-[13px] font-medium hover:cursor-pointer data-[active=true]:bg-muted data-[active=true]:text-foreground data-[active=true]:font-semibold';

interface ConversationItemProps {
  conversation: { id: string; title?: string | null };
  isActive: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

/** One chat in the list, with a "…" menu to rename it inline or delete it. */
function ConversationItem({
  conversation,
  isActive,
  onOpen,
  onRename,
  onDelete,
}: ConversationItemProps) {
  const { isMobile } = useSidebar();
  const title = conversation.title ?? UNTITLED;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // After the menu has closed, so its focus restore does not blur the input
    if (editing) setTimeout(() => inputRef.current?.select(), 0);
  }, [editing]);

  const startRename = () => {
    setDraft(title);
    setEditing(true);
  };

  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <SidebarMenuItem>
        <div className="flex h-8 items-center gap-2 px-2">
          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
          <SidebarInput
            ref={inputRef}
            aria-label="Conversation title"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="h-7 text-[13px]"
            autoFocus
          />
        </div>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} className={itemClassName}>
        <Link
          to="/aistudio/conversations/$conversationId"
          params={{ conversationId: conversation.id }}
          onClick={onOpen}
        >
          <MessageSquare />
          <span className="truncate">{title}</span>
        </Link>
      </SidebarMenuButton>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            aria-label="Conversation actions"
            className="text-muted-foreground hover:cursor-pointer peer-data-[size=default]/menu-button:top-2"
          >
            <MoreHorizontal />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={isMobile ? 'bottom' : 'right'}
          align="start"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuItem onSelect={startRename}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <ConfirmDialog
            title="Delete conversation"
            description={`Are you sure you want to delete "${title}"? This action cannot be undone.`}
            onConfirm={onDelete}
            confirmText="Delete"
            trigger={
              <DropdownMenuItem variant="destructive">
                <Trash2 />
                Delete
              </DropdownMenuItem>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export function AiStudioSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setOpenMobile } = useSidebar();
  const { open: openSettings } = useAgentSettingsDialog();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const activeConversationId = pathname.startsWith(CONVERSATION_PATH_PREFIX)
    ? pathname.slice(CONVERSATION_PATH_PREFIX.length)
    : null;

  const conversationsQueryKey = useMemo(
    () => ['/api/agents/conversations', 'infinite', selectedWorkspaceId],
    [selectedWorkspaceId],
  );

  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } =
    useAgentsControllerGetConversationsInfinite(
      { limit: 20, sortBy: 'updatedAt', sortOrder: 'DESC' },
      {
        query: {
          // Shared with the conversations page so edits there refresh this list.
          queryKey: conversationsQueryKey,
          enabled: !!selectedWorkspaceId,
          getNextPageParam: (lastPage) =>
            lastPage.hasNextPage ? lastPage.page + 1 : undefined,
          // A new chat is only persisted once its first message is sent, so
          // keep polling until the open conversation shows up in the list.
          refetchInterval: (query) =>
            activeConversationId &&
            !query.state.data?.pages.some((page) =>
              page.data.some((c) => c.id === activeConversationId),
            )
              ? 5_000
              : false,
        },
      },
    );

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const invalidateConversations = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
  }, [queryClient, conversationsQueryKey]);

  const updateConversation = useAgentsControllerUpdateConversation({
    mutation: { onSuccess: invalidateConversations },
  });
  const deleteConversation = useAgentsControllerDeleteConversation({
    mutation: { onSuccess: invalidateConversations },
  });
  const deleteAllConversations = useAgentsControllerDeleteAllConversations({
    mutation: { onSuccess: invalidateConversations },
  });

  // The open chat is gone: start a new one instead of showing a dead page.
  const leaveDeletedConversation = useCallback(() => {
    void navigate({ to: '/aistudio' });
  }, [navigate]);

  const handleDelete = (conversationId: string) => {
    deleteConversation.mutate(
      { id: conversationId },
      {
        onSuccess: () => {
          if (conversationId === activeConversationId) {
            leaveDeletedConversation();
          }
        },
      },
    );
  };

  const handleDeleteAll = () => {
    deleteAllConversations.mutate(undefined, {
      onSuccess: () => {
        if (activeConversationId) leaveDeletedConversation();
      },
    });
  };

  return (
    <AppSidebar
      groups={[]}
      primary={false}
      title="AI Studio"
      showSwitchWorkspace={false}
    >
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-px">
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/aistudio' || pathname === '/aistudio/'}
                tooltip="New Chat"
                className={itemClassName}
              >
                <Link to="/aistudio" onClick={() => setOpenMobile(false)}>
                  <SquarePen />
                  <span className="truncate">New Chat</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/aistudio/agents'}
                tooltip="Agents"
                className={itemClassName}
              >
                <Link to="/aistudio/agents" onClick={() => setOpenMobile(false)}>
                  <Bot />
                  <span className="truncate">Agents</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Connectors"
                className={itemClassName}
                onClick={() => {
                  setOpenMobile(false);
                  openSettings('connectors');
                }}
              >
                <Plug />
                <span className="truncate">Connectors</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Settings"
                className={itemClassName}
                onClick={() => {
                  setOpenMobile(false);
                  openSettings();
                }}
              >
                <Settings />
                <span className="truncate">Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="p-0 group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <div className="flex items-center justify-between pr-1">
            <SidebarGroupLabel className="h-6 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              Chats
            </SidebarGroupLabel>
            {conversations.length > 0 && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Chats actions"
                    className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end">
                  <ConfirmDialog
                    title="Delete all conversations"
                    description="Are you sure you want to delete all conversations? This action cannot be undone."
                    onConfirm={handleDeleteAll}
                    confirmText="Delete all"
                    disabled={deleteAllConversations.isPending}
                    trigger={
                      <DropdownMenuItem variant="destructive">
                        <Trash2 />
                        Delete all
                      </DropdownMenuItem>
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <SidebarMenu className="gap-px">
            {isLoading && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && conversations.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                No conversations yet
              </p>
            )}
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onOpen={() => setOpenMobile(false)}
                onRename={(title) =>
                  updateConversation.mutate({ id: conv.id, data: { title } })
                }
                onDelete={() => handleDelete(conv.id)}
              />
            ))}
            {hasNextPage && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="h-8 justify-center text-xs text-muted-foreground hover:cursor-pointer"
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    'Load more'
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </AppSidebar>
  );
}
