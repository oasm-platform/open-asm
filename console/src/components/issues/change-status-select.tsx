import { Button } from '@/components/ui/button';
import type { Issue } from '@/services/apis/gen/queries';
import { useIssuesControllerChangeStatus } from '@/services/apis/gen/queries';
import { CircleCheck, RefreshCcwDot } from 'lucide-react';

interface ChangeStatusSelectProps {
  issue: Issue;
  onSuccess?: () => void;
}

const ChangeStatusSelect: React.FC<ChangeStatusSelectProps> = ({
  issue,
  onSuccess,
}) => {
  const { mutate: changeStatus, isPending } = useIssuesControllerChangeStatus();
  const status = issue.status;

  const handleStatusChange = (newStatus: 'open' | 'closed') => {
    if (issue.id && newStatus !== status) {
      changeStatus(
        { id: issue.id, data: { status: newStatus } },
        {
          onSuccess: () => {
            onSuccess?.();
          },
        },
      );
    }
  };

  const handleClick = () => {
    const newStatus = status === 'open' ? 'closed' : 'open';
    handleStatusChange(newStatus);
  };

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleClick} disabled={isPending} variant="outline">
        {status === 'open' ? (
          <CircleCheck className="text-purple-500" />
        ) : (
          <RefreshCcwDot className="text-green-500" />
        )}
        {status === 'open' ? 'Close issue' : 'Reopen issue'}
      </Button>
    </div>
  );
};

export default ChangeStatusSelect;
