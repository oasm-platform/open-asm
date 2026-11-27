import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useT } from '@/lib/i18n-dictionary';
import { useWorkersControllerRemoveWorker } from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { Unplug } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Disconnects a workspace worker after a confirmation, which revokes its token,
 * then returns to the worker list.
 */
export function DisconnectWorkerButton({ workerId }: { workerId: string }) {
  const t = useT();
  const navigate = useNavigate();

  const removeWorker = useWorkersControllerRemoveWorker({
    mutation: {
      onSuccess: () => {
        toast.success(t('workers.disconnect.success'));
        void navigate({ to: '/workers' });
      },
      onError: () => {
        toast.error(t('workers.disconnect.failed'));
      },
    },
  });

  return (
    <ConfirmDialog
      title={t('workers.disconnect.title')}
      description={t('workers.disconnect.description')}
      confirmText={t('workers.disconnect.confirm')}
      disabled={removeWorker.isPending}
      onConfirm={() => removeWorker.mutate({ id: workerId })}
      trigger={
        <Button
          variant="outline"
          className="text-destructive"
          disabled={removeWorker.isPending}
        >
          <Unplug className="size-4" />
          {t('workers.disconnect.action')}
        </Button>
      }
    />
  );
}
