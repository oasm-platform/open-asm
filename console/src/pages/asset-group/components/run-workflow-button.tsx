import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAssetGroupControllerRunGroupWorkflowScheduler } from '@/services/apis/gen/queries';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface RunAssetGroupWorkflowButtonProps {
  id?: string;
}
const RunWorkflowButton = ({ id }: RunAssetGroupWorkflowButtonProps) => {
  const { mutate } = useAssetGroupControllerRunGroupWorkflowScheduler();
  const handleRun = () => {
    if (id) {
      mutate(
        {
          id,
        },
        {
          onSuccess: (response) => {
            toast(response.message);
          },
        },
      );
    }
  };

  return (
    <ConfirmDialog
      title="Run Tool"
      description={`Are you sure you want to run workflow?`}
      onConfirm={handleRun}
      trigger={
        <Button variant="outline">
          Run
          <ArrowRight className="h-4 w-4" />
        </Button>
      }
    />
  );
};

export default RunWorkflowButton;
