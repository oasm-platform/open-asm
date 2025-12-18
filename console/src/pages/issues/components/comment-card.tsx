import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  IssueCommentType,
  useIssuesControllerDeleteCommentById,
  useIssuesControllerUpdateCommentById,
  type IssueComment,
} from '@/services/apis/gen/queries';
import { useSession } from '@/utils/authClient';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  CircleCheck,
  Edit3,
  MoreHorizontal,
  RefreshCcwDot,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

dayjs.extend(relativeTime);

interface CommentCardProps {
  comment: IssueComment;
  issueCreatedBy: string; // issue.createdBy.id
  onCommentUpdated?: () => void;
}

const CommentCard = ({
  comment,
  issueCreatedBy,
  onCommentUpdated,
}: CommentCardProps) => {
  const { data: sessionData } = useSession();
  const isOwnComment = sessionData?.user?.id === comment.createdBy?.id;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const updateCommentMutation = useIssuesControllerUpdateCommentById();
  const deleteCommentMutation = useIssuesControllerDeleteCommentById();
  const handleEdit = () => {
    setIsEditing(true);
    setEditContent(comment.content);
  };

  const handleSave = () => {
    if (editContent.trim() && editContent !== comment.content) {
      updateCommentMutation.mutate(
        {
          id: comment.id,
          data: { content: editContent },
        },
        {
          onSuccess: (updatedComment) => {
            setIsEditing(false);
            // Notify parent component about the update
            if (updatedComment) {
              onCommentUpdated?.();
            } else {
              // If API doesn't return updated comment, create a partial update object
              onCommentUpdated?.();
            }
          },
          onError: (error) => {
            console.error('Error updating comment:', error);
          },
        },
      );
    } else {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  return (
    <div className="relative">
      {comment.type === IssueCommentType.content && (
        <div className="border border-border rounded-md bg-card shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border rounded-t-md">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Avatar className="h-6 w-6 border border-background bg-background">
                <AvatarImage alt={comment.createdBy?.name || 'User'} />
                <AvatarFallback className="text-[10px]">
                  {(comment.createdBy?.name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="font-semibold">
                {comment.createdBy?.name || 'Unknown'}
              </span>
              <span className="text-muted-foreground">
                {dayjs(comment.createdAt).fromNow()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs border border-border px-2 py-0.5 rounded-full text-muted-foreground bg-background">
                {issueCreatedBy === comment.createdBy?.id ? 'Author' : 'Member'}
              </span>

              {/* Dropdown Menu for Edit/Delete - only show for own comments */}
              {isOwnComment && (comment.isCanEdit || comment.isCanDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger disabled={!comment.isCanEdit} asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-muted"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-40">
                    {comment.isCanEdit && (
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={handleEdit}
                      >
                        <Edit3 className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {comment.isCanDelete && (
                      <ConfirmDialog
                        title="Delete Comment"
                        description="Are you sure you want to delete this comment?"
                        onConfirm={() => {
                          deleteCommentMutation.mutate(
                            { id: comment.id },
                            {
                              onSuccess: () => {
                                onCommentUpdated?.();
                              },
                            },
                          );
                        }}
                        trigger={
                          <DropdownMenuItem
                            disabled={!comment.isCanDelete}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        }
                      />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="p-4 prose prose-sm max-w-none dark:prose-invert">
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[100px] w-full"
                  disabled={updateCommentMutation.isPending}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={updateCommentMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={
                      updateCommentMutation.isPending ||
                      !editContent.trim() ||
                      editContent === comment.content
                    }
                  >
                    {updateCommentMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed mb-0">
                {comment.content}
              </p>
            )}
          </div>
        </div>
      )}
      {comment.type !== IssueCommentType.content && (
        <div>
          <div className="px-4.5 flex">
            {comment.type === IssueCommentType.closed && (
              <CircleCheck className="text-purple-500" />
            )}
            {comment.type === IssueCommentType.open && (
              <RefreshCcwDot className="text-green-500" />
            )}
            <Avatar className="h-6 w-6 border border-background bg-background mx-2">
              <AvatarImage alt={comment.createdBy?.name || 'User'} />
              <AvatarFallback className="text-[10px]">
                {(comment.createdBy?.name || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex gap-1 items-center">
              <span className="font-bold">
                {comment.createdBy?.name || 'User'}
              </span>
              <span>{comment.content}</span>
              <span className="text-muted-foreground">
                {dayjs(comment.createdAt).fromNow()}
              </span>
            </div>
          </div>
        </div>
      )}
      <div className="h-7 w-full">
        <div className="w-1 h-7 left-7 absolute border-l-[3px]"></div>
      </div>
    </div>
  );
};

export default CommentCard;
