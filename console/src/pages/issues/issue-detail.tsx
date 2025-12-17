import Page from '@/components/common/page';
import { StatusBadge } from '@/components/ui/status-badge';
import { useIssuesControllerGetById } from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useParams } from 'react-router-dom';

dayjs.extend(relativeTime);

const IssueDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: issue, isLoading } = useIssuesControllerGetById(id || '');

  if (isLoading) {
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
      isShowButtonGoBack
      title={
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-normal">#{issue.no}</span>
            <span>{issue.title}</span>
          </div>
          <StatusBadge status={status} className="h-8 px-2" />
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
            <span>•</span>
            <span>{0} comments</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0">
            <div className="text-base pb-8 border-b border-border">
              <p className="whitespace-pre-wrap leading-relaxed italic text-muted-foreground">
                {issue.description || 'No description provided.'}
              </p>
            </div>
          </div>

          <div className="w-full lg:w-64 shrink-0 space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Assignees
              </h3>
              <span className="text-sm text-muted-foreground italic">
                No one assigned
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Labels
              </h3>
              <span className="text-sm text-muted-foreground italic">
                None yet
              </span>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
};

export default IssueDetail;
