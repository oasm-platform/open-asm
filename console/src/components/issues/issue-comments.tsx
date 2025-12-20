import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useIssuesControllerCreateComment,
  useIssuesControllerGetById,
  useIssuesControllerGetCommentsByIssueId,
  type Issue,
  type IssueComment,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { SendHorizontal, Reply } from 'lucide-react';
import { useState } from 'react';
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
                    // Trigger a refetch to get the updated comment from the API
                    refetchComments();
                  }}
                  onReply={(comment) => {
                    setReplyingTo(comment);
                    // focus on textarea
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
          <div className="relative">
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
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={
                replyingTo
                  ? 'Type your reply... (use @cai for AI assistance)'
                  : 'Leave a comment (use @cai for AI assistance)'
              }
              className={`resize-none min-h-[100px] w-full mb-2 ${replyingTo ? 'rounded-t-none border-t-0' : ''}`}
              disabled={issue.status === 'closed'}
            />
            <div className="flex justify-end gap-2">
              <ChangeStatusSelect
                onSuccess={() => {
                  refetchIssue();
                  refetchComments();
                }}
                issue={issue}
              />
              <Button
                variant="outline"
                onClick={handleCreateComment}
                disabled={
                  !newComment.trim() ||
                  createCommentMutation.isPending ||
                  issue.status === 'closed'
                }
                className="px-4 py-2"
              >
                {createCommentMutation.isPending ? 'Posting...' : 'Comment'}{' '}
                <SendHorizontal />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IssueComments;
