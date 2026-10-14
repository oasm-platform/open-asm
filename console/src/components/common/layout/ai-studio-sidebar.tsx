import { Link, useLocation } from '@tanstack/react-router';
import {
  BookOpen,
  Brain,
  KeyRound,
  Loader2,
  MessageSquare,
  SquarePen,
} from 'lucide-react';
import { useMemo } from 'react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useAgentsControllerGetConversationsInfinite } from '@/services/apis/gen/queries';
import { AppSidebar } from './menu-bar';

const CONVERSATION_PATH_PREFIX = '/aistudio/conversations/';

const settingsItems = [
  { to: '/aistudio/providers', label: 'Providers', icon: KeyRound },
  { to: '/aistudio/skills', label: 'Skills', icon: BookOpen },
  { to: '/aistudio/memory', label: 'Memory', icon: Brain },
] as const;

const itemClassName =
  'h-9 rounded-lg text-[13px] font-medium hover:cursor-pointer data-[active=true]:bg-muted data-[active=true]:text-foreground data-[active=true]:font-semibold';

export function AiStudioSidebar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const activeConversationId = pathname.startsWith(CONVERSATION_PATH_PREFIX)
    ? pathname.slice(CONVERSATION_PATH_PREFIX.length)
    : null;

  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } =
    useAgentsControllerGetConversationsInfinite(
      { limit: 20, sortBy: 'updatedAt', sortOrder: 'DESC' },
      {
        query: {
          // Shared with the conversations page so edits there refresh this list.
          queryKey: [
            '/api/agents/conversations',
            'infinite',
            selectedWorkspaceId,
          ],
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

  return (
    <AppSidebar
      groups={[]}
      primary={false}
      title="AI Studio"
      showSwitchWorkspace={false}
    >
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
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
            {settingsItems.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.to}
                  tooltip={item.label}
                  className={itemClassName}
                >
                  <Link to={item.to} onClick={() => setOpenMobile(false)}>
                    <item.icon />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="p-0 group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            Chats
          </SidebarGroupLabel>
          <SidebarMenu className="mt-1 gap-0.5">
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
              <SidebarMenuItem key={conv.id}>
                <SidebarMenuButton
                  asChild
                  isActive={conv.id === activeConversationId}
                  className={itemClassName}
                >
                  <Link
                    to="/aistudio/conversations/$conversationId"
                    params={{ conversationId: conv.id }}
                    onClick={() => setOpenMobile(false)}
                  >
                    <MessageSquare />
                    <span className="truncate">
                      {conv.title ?? 'New conversation'}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
