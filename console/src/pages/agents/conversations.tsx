import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useAgentsControllerDeleteAllConversations,
  useAgentsControllerDeleteConversation,
  useAgentsControllerGetConversationsInfinite,
  useAgentsControllerUpdateConversation,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

dayjs.extend(relativeTime);

export default function AgentConversationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const limit = 20;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } =
    useAgentsControllerGetConversationsInfinite(
      { limit, sortBy: 'updatedAt', sortOrder: 'DESC' },
      {
        query: {
          queryKey: [
            '/api/agents/conversations',
            'infinite',
            selectedWorkspaceId,
          ],
          enabled: !!selectedWorkspaceId,
          getNextPageParam: (lastPage) =>
            lastPage.hasNextPage ? lastPage.page + 1 : undefined,
        },
      },
    );

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const invalidateConversations = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['/api/agents/conversations', 'infinite', selectedWorkspaceId],
    });
  }, [queryClient, selectedWorkspaceId]);

  const deleteConversationMutation = useAgentsControllerDeleteConversation({
    mutation: { onSuccess: invalidateConversations },
  });

  const deleteAllMutation = useAgentsControllerDeleteAllConversations({
    mutation: { onSuccess: invalidateConversations },
  });

  const updateConversationMutation = useAgentsControllerUpdateConversation({
    mutation: { onSuccess: invalidateConversations },
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

  const handleDeleteAll = useCallback(() => {
    deleteAllMutation.mutate();
  }, [deleteAllMutation]);

  const startEditing = useCallback(
    (e: React.MouseEvent, conv: { id: string; title?: string | null }) => {
      e.stopPropagation();
      setEditingId(conv.id);
      setEditingTitle(conv.title ?? 'New conversation');
      setTimeout(() => inputRef.current?.select(), 0);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (editingId && editingTitle.trim()) {
      updateConversationMutation.mutate({
        id: editingId,
        data: { title: editingTitle.trim() },
      });
    }
    setEditingId(null);
  }, [editingId, editingTitle, updateConversationMutation]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commitRename();
      if (e.key === 'Escape') setEditingId(null);
    },
    [commitRename],
  );

  return (
    <Page
      title="Conversations"
      isShowButtonGoBack
      className="w-full md:w-2/3 lg:w-1/2 mx-auto"
      action={
        conversations.length > 0 ? (
          <ConfirmDialog
            title="Delete all conversations"
            description="Are you sure you want to delete all conversations? This action cannot be undone."
            onConfirm={handleDeleteAll}
            confirmText="Delete all"
            trigger={
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                disabled={deleteAllMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete all
              </Button>
            }
          />
        ) : undefined
      }
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
                {editingId === conv.id ? (
                  <>
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      ref={inputRef}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={handleRenameKeyDown}
                      className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                  </>
                ) : (
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
                )}

                {editingId !== conv.id && (
                  <>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded shrink-0"
                      onClick={(e) => startEditing(e, conv)}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
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
                  </>
                )}
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
