import Page from '@/components/common/page';
import IssueComments from '@/components/issues/issue-comments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/ui/status-badge';
import {
  useIssuesControllerGetById,
  useIssuesControllerUpdate,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PencilIcon, Save } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

dayjs.extend(relativeTime);

const IssueDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: issue, refetch } = useIssuesControllerGetById(id || '');
  const { mutate: updateIssue } = useIssuesControllerUpdate();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  if (!issue) {
    return <></>;
  }

  const status = issue.status;

  const handleEdit = () => {
    setIsEditing(true);
    setEditTitle(issue.title);
  };

  const handleSave = () => {
    if (editTitle.trim() && issue.id) {
      updateIssue(
        { id: issue.id, data: { title: editTitle.trim() } },
        {
          onSuccess: () => {
            setIsEditing(false);
            refetch(); // Refetch to get updated issue data
          },
        },
      );
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <Page className="w-full xl:w-1/2 mx-auto">
      <div>
        <div className="flex items-center justify-between mb-3">
          {isEditing ? (
            <div className="flex flex-col w-full md:flex-row items-center gap-2">
              <Input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className=""
              />
              <div className="flex w-full md:w-auto justify-end gap-2">
                <Button variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button variant="secondary" onClick={handleSave}>
                  Save <Save />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-start items-start md:flex-row w-full gap-2">
              <div className="flex items-center w-full gap-2 text-2xl">
                <h3 className="font-bold tracking-tight">
                  {issue.title}{' '}
                  <span className="text-gray-400 font-normal">#{issue.no}</span>
                </h3>
              </div>
              <Button onClick={handleEdit} variant="outline">
                <PencilIcon /> Edit
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={status} />
            <span className="text-muted-foreground mr-1">
              <span className="font-medium text-foreground">
                {issue.createdBy?.name || 'Unknown'}
              </span>{' '}
              opened this issue {dayjs(issue.createdAt).fromNow()}
            </span>
          </div>
        </div>
        <IssueComments issue={issue} />
      </div>
    </Page>
  );
};

export default IssueDetail;
