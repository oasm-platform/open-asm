import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAssetGroupControllerRunGroupWorkflowScheduler } from '@/services/apis/gen/queries';
import type { AxiosError } from 'axios';
import { Play } from 'lucide-react';
import { toast } from 'sonner';

interface RunAssetGroupWorkflowButtonProps {
  id?: string;
  disabled?: boolean;
}
const RunWorkflowButton = ({
  id,
  disabled,
}: RunAssetGroupWorkflowButtonProps) => {
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
          onError: (e) => {
            const err = e as AxiosError<{ message: string }>;
            toast.error(err.response?.data.message);
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
        <Button
          disabled={disabled}
          variant="outline"
          className="border-green-500/60 text-green-500 hover:bg-green-500/10 hover:text-green-600"
        >
          <Play className="h-4 w-4" />
          Run
        </Button>
      }
    />
  );
};

export default RunWorkflowButton;
