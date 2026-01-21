import Page from '@/components/common/page';
import IssueComments from '@/components/issues/issue-comments';
import IssueTags from '@/components/issues/issue-tags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/ui/status-badge';
import {
  useIssuesControllerGetById,
  useIssuesControllerUpdate,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Check, MoveUpRight, PencilIcon, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

dayjs.extend(relativeTime);

/**
 * Issue detail page following GitHub's issue layout pattern.
 * Features a two-column layout with main content and metadata sidebar.
 */
const IssueDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: issue, refetch } = useIssuesControllerGetById(id || '');
  const { mutate: updateIssue, isPending } = useIssuesControllerUpdate();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const handleEdit = useCallback(() => {
    if (issue) {
      setIsEditing(true);
      setEditTitle(issue.title);
    }
  }, [issue]);

  const handleSave = useCallback(() => {
    if (editTitle.trim() && issue?.id) {
      updateIssue(
        { id: issue.id, data: { title: editTitle.trim() } },
        {
          onSuccess: () => {
            setIsEditing(false);
            refetch();
          },
        },
      );
    }
  }, [editTitle, issue?.id, updateIssue, refetch]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditTitle('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  if (!issue) {
    return null;
  }

  const mapingRouterSourceType = (sourceType: string): string | null => {
    switch (sourceType) {
      case 'vulnerability':
        return 'vulnerabilities';
      default:
        return null;
    }
  };

  return (
    <Page className="w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 mx-auto">
      <div className="mb-6 pb-4 border-b border-border">
        <div className="mb-2">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="text-2xl font-semibold flex-1"
                placeholder="Issue title"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                disabled={isPending}
              >
                <X size={18} />
              </Button>
              <Button
                variant="default"
                size="icon"
                onClick={handleSave}
                disabled={isPending || !editTitle.trim()}
              >
                <Check size={18} />
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <h1 className="text-2xl font-semibold flex-1">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{ p: 'span' }}
                >
                  {issue.title}
                </ReactMarkdown>
                <span className="text-muted-foreground font-normal ml-2">
                  #{issue.no}
                </span>
              </h1>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                className="shrink-0"
              >
                <PencilIcon size={14} />
                Edit
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={issue.status} />
          <span>
            <span className="font-medium text-foreground">
              {issue.createdBy?.name || 'Unknown'}
            </span>{' '}
            opened this issue {dayjs(issue.createdAt).fromNow()}
          </span>
          {issue.sourceId && (
            <Link
              to={`/${mapingRouterSourceType(issue.sourceType)}/${issue.sourceId}`}
            >
              <Button variant="link" className="capitalize">
                {issue?.sourceType} <MoveUpRight />
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start gap-8">
        <div className="flex-1 min-w-0 order-2 lg:order-1">
          <IssueComments issue={issue} />
        </div>

        <div className="w-full lg:w-64 shrink-0 order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Labels
            </h3>
            <IssueTags issue={issue} onUpdate={refetch} />
          </div>
        </div>
      </div>
    </Page>
  );
};

export default IssueDetail;