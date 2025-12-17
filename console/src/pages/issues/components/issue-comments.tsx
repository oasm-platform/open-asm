import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useIssuesControllerCreateComment,
  useIssuesControllerGetCommentsByIssueId,
  type Issue,
  type IssueComment,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import CommentCard from './comment-card';

dayjs.extend(relativeTime);

interface IssueCommentsProps {
  issue: Issue;
}

const IssueComments = ({ issue }: IssueCommentsProps) => {
  const { data: commentsData, refetch: refetchComments } =
    useIssuesControllerGetCommentsByIssueId(issue.id, {
      limit: 100,
      page: 1,
    });
  const createCommentMutation = useIssuesControllerCreateComment();
  const [newComment, setNewComment] = useState('');

  const handleCreateComment = () => {
    if (newComment.trim()) {
      createCommentMutation.mutate(
        {
          issueId: issue.id,
          data: { content: newComment },
        },
        {
          onSuccess: () => {
            setNewComment('');
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
                />
              </div>
            ))}
          </div>

          {/* New comment input */}
          <div>
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Leave a comment"
              className="resize-none min-h-[100px] w-full mb-2"
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleCreateComment}
                disabled={!newComment.trim() || createCommentMutation.isPending}
                className="px-4 py-2"
              >
                {createCommentMutation.isPending ? 'Posting...' : 'Comment'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IssueComments;
