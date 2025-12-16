import Page from "@/components/common/page";
import { Badge } from '@/components/ui/badge';
import { useIssuesControllerGetById } from '@/services/apis/gen/queries';
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { CheckCircleIcon, CircleIcon } from 'lucide-react';
import { useParams } from 'react-router-dom';

dayjs.extend(relativeTime);

const IssueDetail = () => {
    const { id } = useParams<{ id: string }>();
    const { data: issue, isLoading } = useIssuesControllerGetById(id || '');

    if (isLoading) {
        return <Page title="Issue Detail"><div>Loading...</div></Page>;
    }

    if (!issue) {
        return <Page title="Issue Detail"><div>Issue not found</div></Page>;
    }

    let statusColor = "text-gray-500";
    let StatusIcon = CircleIcon;
    const status = issue.status;

    if (status?.toLowerCase() === 'open') {
        statusColor = "text-green-500";
        StatusIcon = CircleIcon;
    } else if (status?.toLowerCase() === 'closed') {
        statusColor = "text-purple-500";
        StatusIcon = CheckCircleIcon;
    }




    return (
        <Page title={
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-normal">#{issue.no}</span>
                    <span>{issue.title}</span>
                </div>
                <Badge variant="outline" className={`${statusColor} h-8 flex items-center gap-1 ml-0 sm:ml-2 capitalize`}>
                    <StatusIcon className="h-6 w-6" />
                    {status}
                </Badge>
            </div>
        }>
            <div className="max-w-4xl">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="text-muted-foreground mr-1">
                            <span className="font-medium text-foreground">{issue.createdBy?.name || 'Unknown'}</span> opened this issue {dayjs(issue.createdAt).fromNow()}
                        </span>
                        <span>•</span>
                        <span>{0} comments</span>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    <div className="flex-1 min-w-0">
                        <div className="text-base pb-8 border-b border-border">
                            <p className="whitespace-pre-wrap leading-relaxed italic text-muted-foreground">{issue.description || 'No description provided.'}</p>
                        </div>
                    </div>

                    <div className="w-full lg:w-64 shrink-0 space-y-6">
                        <div className="space-y-1">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assignees</h3>
                            <span className="text-sm text-muted-foreground italic">No one assigned</span>
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Labels</h3>
                            <span className="text-sm text-muted-foreground italic">None yet</span>
                        </div>
                    </div>
                </div>
            </div>
        </Page>
    );
};

export default IssueDetail;
