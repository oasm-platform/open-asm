import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useIssuesControllerCreateComment,
  useIssuesControllerGetById,
  useIssuesControllerGetCommentsByIssueId,
  useRootControllerGetMetadata,
  type Issue,
  type IssueComment,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { SendHorizontal, Reply } from 'lucide-react';
import { useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import ChangeStatusSelect from './change-status-select';
import CommentCard from './comment-card';

dayjs.extend(relativeTime);

interface IssueCommentsProps {
  issue: Issue;
}

const IssueComments = ({ issue }: IssueCommentsProps) => {
  const { refetch: refetchIssue } = useIssuesControllerGetById(issue.id);
  const { data: commentsData, refetch: refetchComments } =
    useIssuesControllerGetCommentsByIssueId(issue.id, {
      limit: 100,
      page: 1,
    });
  const createCommentMutation = useIssuesControllerCreateComment();
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<IssueComment | null>(null);
  const isAssistant = useRootControllerGetMetadata().data?.isAssistant;

  const handleCreateComment = () => {
    if (newComment.trim()) {
      createCommentMutation.mutate(
        {
          issueId: issue.id,
          data: {
            content: newComment,
            repCommentId: replyingTo?.id,
          },
        },
        {
          onSuccess: () => {
            setNewComment('');
            setReplyingTo(null);
            refetchComments();
          },
        },
      );
    }
  };

  const textareaRef = useHotkeys<HTMLTextAreaElement>(
    'enter',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleCreateComment();
    },
    {
      enableOnFormTags: ['TEXTAREA'],
      preventDefault: true,
    },
  );

  const comments = commentsData?.data || [];

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="flex-1 min-w-0">
        <div>
          <div>
            {comments.map((comment: IssueComment) => (
              <div key={comment.id}>
                <CommentCard
                  comment={comment}
                  issueCreatedBy={issue.createdBy.id}
                  onCommentUpdated={() => {
                    refetchComments();
                  }}
                  onReply={(comment) => {
                    setReplyingTo(comment);
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                      textarea.focus();
                    }
                  }}
                />
              </div>
            ))}
          </div>

          {/* New comment input */}
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {replyingTo && (
              <div className="flex items-center justify-between bg-muted/50 p-2 rounded-t-md border border-b-0 border-border text-xs mb-0">
                <span className="flex items-center gap-1">
                  <Reply className="h-3 w-3" />
                  Replying to{' '}
                  <span className="font-semibold">
                    {replyingTo.createdBy?.name}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setReplyingTo(null)}
                >
                  Cancel
                </Button>
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={
                isAssistant
                  ? 'Leave a comment (Use @cai for AI assistance)'
                  : replyingTo
                    ? 'Type your reply to this comment...'
                    : 'Add your comment here...'
              }
              className={`resize-none min-h-[100px] w-full mb-2 ${replyingTo ? 'rounded-t-none border-t-0' : ''}`}
              disabled={issue.status === 'closed'}
            />
            <div className="flex justify-end gap-2">
              <ChangeStatusSelect
                issue={issue}
                onSuccess={() => {
                  refetchIssue();
                  refetchComments();
                }}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={
                  !newComment.trim() ||
                  createCommentMutation.isPending ||
                  issue.status === 'closed'
                }
                className="px-4 py-2"
                onClick={handleCreateComment}
              >
                {createCommentMutation.isPending ? 'Posting...' : 'Comment'}{' '}
                <SendHorizontal />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default IssueComments;
