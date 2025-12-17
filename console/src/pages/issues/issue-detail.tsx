import Page from '@/components/common/page';
import { StatusBadge } from '@/components/ui/status-badge';
import IssueComments from '@/pages/issues/components/issue-comments';
import { useIssuesControllerGetById } from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useParams } from 'react-router-dom';

dayjs.extend(relativeTime);

const IssueDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: issue, isLoading: issueLoading } = useIssuesControllerGetById(
    id || '',
  );

  if (issueLoading) {
    return (
      <Page title="Issue Detail">
        <div>Loading...</div>
      </Page>
    );
  }

  if (!issue) {
    return (
      <Page title="Issue Detail">
        <div>Issue not found</div>
      </Page>
    );
  }

  const status = issue.status;

  return (
    <Page
      title={
        <div className="flex flex-col  items-start gap-2">
          <div className="flex items-center gap-2">
            <span>
              {issue.title}{' '}
              <span className="text-gray-400 font-normal">#{issue.no}</span>
            </span>
          </div>
          <StatusBadge status={status} />
        </div>
      }
    >
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
