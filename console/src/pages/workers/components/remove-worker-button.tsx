import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useT } from '@/lib/i18n-dictionary';
import { useWorkersControllerRemoveWorker } from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Removes a workspace worker after a confirmation, which revokes its token,
 * then returns to the worker list.
 */
export function RemoveWorkerButton({ workerId }: { workerId: string }) {
  const t = useT();
  const navigate = useNavigate();

  const removeWorker = useWorkersControllerRemoveWorker({
    mutation: {
      onSuccess: () => {
        toast.success(t('workers.remove.success'));
        void navigate({ to: '/workers' });
      },
      onError: () => {
        toast.error(t('workers.remove.failed'));
      },
    },
  });

  return (
    <ConfirmDialog
      title={t('workers.remove.title')}
      description={t('workers.remove.description')}
      confirmText={t('common.remove')}
      disabled={removeWorker.isPending}
      onConfirm={() => removeWorker.mutate({ id: workerId })}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-red-600 hover:text-red-800"
          aria-label={t('workers.remove.action')}
          title={t('workers.remove.action')}
        >
          <Trash2 className="size-4" />
        </Button>
      }
    />
  );
}
