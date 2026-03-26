import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useAgentsControllerDeleteConversation,
  useAgentsControllerGetConversationsInfinite,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MessageSquare, Trash2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

dayjs.extend(relativeTime);

export default function AgentConversationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const limit = 20;

  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } =
    useAgentsControllerGetConversationsInfinite(
      { limit, sortBy: 'updatedAt', sortOrder: 'DESC' },
      {
        query: {
          queryKey: ['/api/agents/conversations', 'infinite'],
          getNextPageParam: (lastPage) =>
            lastPage.hasNextPage ? lastPage.page + 1 : undefined,
        },
      },
    );

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const deleteConversationMutation = useAgentsControllerDeleteConversation({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: ['/api/agents/conversations', 'infinite'],
        });
      },
    },
  });

  const handleSelect = useCallback(
    (conversationId: string) => {
      void navigate(`/agents/conversations/${conversationId}`);
    },
    [navigate],
  );

  const handleDelete = useCallback(
    (conversationId: string) => {
      deleteConversationMutation.mutate({ id: conversationId });
    },
    [deleteConversationMutation],
  );

  return (
    <Page
      title="Conversations"
      isShowButtonGoBack
      className="w-full md:w-2/3 lg:w-1/2 mx-auto"
    >
      <div>
        {isLoading && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            No conversations yet.
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors group"
              >
                <button
                  onClick={() => handleSelect(conv.id)}
                  className="flex items-center gap-3 flex-1 text-left min-w-0"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-foreground">
                    {conv.title ?? 'New conversation'}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {dayjs(conv.updatedAt).fromNow()}
                  </span>
                </button>
                <ConfirmDialog
                  title="Delete conversation"
                  description="Are you sure you want to delete this conversation? This action cannot be undone."
                  onConfirm={() => handleDelete(conv.id)}
                  confirmText="Delete"
                  trigger={
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  }
                />
              </div>
            ))}
          </div>
        )}

        {hasNextPage && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </Page>
  );
}
