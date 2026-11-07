import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  commentsControllerListIssueComments,
  commentsControllerListVulnerabilityComments,
  useCommentsControllerCreateIssueComment,
  useCommentsControllerCreateVulnerabilityComment,
  useCommentsControllerDeleteComment,
  useCommentsControllerUpdateComment,
  type CommentAuthorDto,
  type CommentResponseDto,
} from '@/services/apis/gen/queries';
import { useSession } from '@/utils/authClient';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Activity, MessageSquare, Pencil, Reply, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export interface CommentSubject {
  type: 'issue' | 'vulnerability';
  id: string;
}

const PAGE_SIZE = 100;

/** Query key of a subject's thread; invalidate it after anything that writes a system comment. */
export const commentThreadQueryKey = (subject: CommentSubject) =>
  ['comments', subject.type, subject.id] as const;

export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : (parts[0]?.slice(0, 2) ?? '?');
  return letters.toUpperCase();
}

export function UserAvatar({
  user,
  className,
}: {
  user?: Pick<CommentAuthorDto, 'name' | 'image'> | null;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-7', className)}>
      {user?.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
      <AvatarFallback className="text-[10px] font-medium">
        {initials(user?.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDistanceToNow(date, { addSuffix: true });
}

function errorMessage(error: unknown, fallback: string) {
  const message = (
    error as { response?: { data?: { message?: unknown } } } | undefined
  )?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' && message ? message : fallback;
}

export function CommentThread({ subject }: { subject: CommentSubject }) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const queryKey = commentThreadQueryKey(subject);

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      subject.type === 'issue'
        ? commentsControllerListIssueComments(
            subject.id,
            { page: pageParam, limit: PAGE_SIZE },
            undefined,
            signal,
          )
        : commentsControllerListVulnerabilityComments(
            subject.id,
            { page: pageParam, limit: PAGE_SIZE },
            undefined,
            signal,
          ),
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    enabled: Boolean(subject.id),
  });

  const comments = query.data?.pages.flatMap((page) => page.data) ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommentResponseDto | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deleting, setDeleting] = useState<CommentResponseDto | null>(null);

  const onError = (fallback: string) => (error: unknown) =>
    toast.error(errorMessage(error, fallback));

  const createIssueComment = useCommentsControllerCreateIssueComment();
  const createVulnComment = useCommentsControllerCreateVulnerabilityComment();
  const updateComment = useCommentsControllerUpdateComment();
  const deleteComment = useCommentsControllerDeleteComment();
  const creating = createIssueComment.isPending || createVulnComment.isPending;

  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    const data = {
      content,
      ...(replyTo ? { repCommentId: replyTo.id } : {}),
    };
    const callbacks = {
      onSuccess: () => {
        setDraft('');
        setReplyTo(null);
        void invalidate();
      },
      onError: onError('Failed to post the comment'),
    };
    if (subject.type === 'issue') {
      createIssueComment.mutate({ issueId: subject.id, data }, callbacks);
    } else {
      createVulnComment.mutate(
        { vulnerabilityId: subject.id, data },
        callbacks,
      );
    }
  };

  const saveEdit = (id: string) => {
    const content = editDraft.trim();
    if (!content) return;
    updateComment.mutate(
      { id, data: { content } },
      {
        onSuccess: () => {
          setEditingId(null);
          void invalidate();
        },
        onError: onError('Failed to update the comment'),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteComment.mutate(
      { id: deleting.id },
      {
        onSuccess: () => {
          setDeleting(null);
          void invalidate();
        },
        onError: onError('Failed to delete the comment'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid="comment-thread">
      {query.isLoading ? (
        <div className="flex flex-col gap-3" aria-label="Loading comments">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <p className="text-sm text-destructive">Failed to load comments.</p>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
          <MessageSquare className="size-5" />
          No activity yet. Start the conversation below.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {comments.map((comment) => {
            if (comment.type !== 'content') {
              return (
                <li
                  key={comment.id}
                  className="flex items-start gap-2 px-1 text-xs text-muted-foreground"
                  data-testid="comment-activity"
                >
                  <Activity className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    {comment.author && (
                      <span className="font-medium text-foreground">
                        {comment.author.name}{' '}
                      </span>
                    )}
                    <span className="break-words">{comment.content}</span>
                    <span> · {timeAgo(comment.createdAt)}</span>
                  </span>
                </li>
              );
            }

            const own =
              Boolean(currentUserId) && comment.author?.id === currentUserId;
            const canEdit = own && comment.isCanEdit;
            const canDelete = own && comment.isCanDelete;
            const isEditing = editingId === comment.id;
            const edited =
              new Date(comment.updatedAt).getTime() -
                new Date(comment.createdAt).getTime() >
              1000;

            return (
              <li
                key={comment.id}
                className="flex gap-3"
                data-testid="comment-item"
              >
                <UserAvatar user={comment.author} />
                <div className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-medium text-foreground">
                      {comment.author?.name ?? 'Unknown user'}
                    </span>
                    <span className="text-muted-foreground">
                      {timeAgo(comment.createdAt)}
                      {edited ? ' · edited' : ''}
                    </span>
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label="Reply"
                        onClick={() => setReplyTo(comment)}
                      >
                        <Reply className="size-3.5" />
                      </Button>
                      {canEdit && !isEditing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Edit comment"
                          onClick={() => {
                            setEditingId(comment.id);
                            setEditDraft(comment.content);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Delete comment"
                          onClick={() => setDeleting(comment)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {comment.repComment && (
                    <div className="mt-1 border-l-2 pl-2 text-xs text-muted-foreground">
                      {comment.repComment.deleted ? (
                        <em>Original comment deleted</em>
                      ) : (
                        <>
                          <span className="font-medium">
                            {comment.repComment.author?.name ?? 'Unknown'}:
                          </span>{' '}
                          {comment.repComment.snippet}
                        </>
                      )}
                    </div>
                  )}
                  {isEditing ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <Textarea
                        aria-label="Edit comment text"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={!editDraft.trim() || updateComment.isPending}
                          onClick={() => saveEdit(comment.id)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {comment.content}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {query.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}

      <div className="flex flex-col gap-2">
        {replyTo && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Reply className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Replying to{' '}
              <span className="font-medium">
                {replyTo.author?.name ?? 'comment'}
              </span>
              : {replyTo.content}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              aria-label="Cancel reply"
              onClick={() => setReplyTo(null)}
            >
              <X className="size-3" />
            </Button>
          </div>
        )}
        <Textarea
          aria-label="Comment"
          placeholder="Write a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!draft.trim() || creating}
            onClick={submit}
          >
            Comment
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete comment?"
        description="The comment is removed from the thread."
        confirmText="Delete"
        disabled={deleteComment.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default CommentThread;
