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
  Reply,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

dayjs.extend(relativeTime);

interface CommentCardProps {
  comment: IssueComment;
  issueCreatedBy: string; // issue.createdBy.id
  onCommentUpdated?: () => void;
  onReply?: (comment: IssueComment) => void;
}

const CodeBlock = ({
  language,
  value,
}: {
  language?: string;
  value: string;
}) => {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4">
      <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 bg-card/80 backdrop-blur-sm hover:bg-card border border-border"
          onClick={onCopy}
          title="Copy code"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed max-w-none">
        <code className={language ? `language-${language}` : ''}>
          {value.trim()}
        </code>
      </pre>
    </div>
  );
};

const CommentCard = ({
  comment,
  issueCreatedBy,
  onCommentUpdated,
  onReply,
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

              {/* Reply Button */}
              {onReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-muted"
                  onClick={() => onReply(comment)}
                  title="Reply"
                >
                  <Reply className="h-4 w-4" />
                </Button>
              )}

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
            {comment.repComment && !isEditing && (
              <div className="mb-4 border border-border/60 rounded bg-muted/20 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 border-b border-border/40 text-[11px] text-muted-foreground">
                  <Reply className="h-3 w-3" />
                  <span className="font-semibold text-foreground/80">
                    {comment.repComment.createdBy?.name || 'Unknown'}
                  </span>
                </div>
                <div className="p-2.5 text-[13px] text-muted-foreground/80 italic overflow-hidden relative max-h-[4.5rem]">
                  <div className="line-clamp-2">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Render block elements as fragments/spans to keep text flow flat in preview
                        p: ({ ...props }) => <span {...props} />,
                        h1: ({ ...props }) => (
                          <span className="font-bold" {...props} />
                        ),
                        h2: ({ ...props }) => (
                          <span className="font-bold" {...props} />
                        ),
                        h3: ({ ...props }) => (
                          <span className="font-bold" {...props} />
                        ),
                        h4: ({ ...props }) => (
                          <span className="font-bold" {...props} />
                        ),
                        ul: ({ ...props }) => (
                          <span className="ml-2" {...props} />
                        ),
                        ol: ({ ...props }) => (
                          <span className="ml-2" {...props} />
                        ),
                        li: ({ ...props }) => (
                          <span className="mr-2" {...props} />
                        ),
                      }}
                    >
                      {comment.repComment.content}
                    </ReactMarkdown>
                  </div>
                  {/* Subtle fade to indicate more content if it's long */}
                  <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-muted/20 to-transparent pointer-events-none" />
                </div>
              </div>
            )}
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
              <div className="leading-relaxed mb-0">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ ...props }) => (
                      <h1
                        className="text-xl font-bold border-b pb-2 mb-4 mt-6"
                        {...props}
                      />
                    ),
                    h2: ({ ...props }) => (
                      <h2
                        className="text-lg font-bold border-b pb-1 mb-3 mt-5"
                        {...props}
                      />
                    ),
                    h3: ({ ...props }) => (
                      <h3
                        className="text-base font-bold mb-2 mt-4"
                        {...props}
                      />
                    ),
                    h4: ({ ...props }) => (
                      <h4 className="text-sm font-bold mb-2 mt-3" {...props} />
                    ),
                    p: ({ ...props }) => (
                      <p className="mb-4 last:mb-0" {...props} />
                    ),
                    ul: ({ ...props }) => (
                      <ul
                        className="list-disc pl-6 mb-4 space-y-1"
                        {...props}
                      />
                    ),
                    ol: ({ ...props }) => (
                      <ol
                        className="list-decimal pl-6 mb-4 space-y-1"
                        {...props}
                      />
                    ),
                    blockquote: ({ ...props }) => (
                      <blockquote
                        className="border-l-4 border-muted pl-4 italic my-4"
                        {...props}
                      />
                    ),
                    code: ({
                      className,
                      children,
                      inline,
                      ...props
                    }: {
                      className?: string;
                      children?: React.ReactNode;
                      inline?: boolean;
                    }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const value = String(children).replace(/\n$/, '');

                      if (!inline && match) {
                        return <CodeBlock language={match[1]} value={value} />;
                      }

                      if (!inline && value.includes('\n')) {
                        return <CodeBlock value={value} />;
                      }

                      return (
                        <code
                          className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {comment.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}
      {comment.type !== IssueCommentType.content && (
        <div>
          <div className="pl-4.5  flex">
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
