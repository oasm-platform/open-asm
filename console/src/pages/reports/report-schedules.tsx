import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCronLabel, getLocalTimezone } from '@/lib/cron-schedule';
import { fromNow } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import {
  useReportsControllerDeleteSchedule,
  useReportsControllerListSchedules,
} from '@/services/apis/gen/queries';

export const reportSchedulesKey = (workspaceId?: string) => ['report-schedules', workspaceId];

export function ReportSchedules({ workspaceId }: { workspaceId?: string }) {
  const t = useT();
  const timezone = getLocalTimezone();
  const { data, isLoading, refetch } = useReportsControllerListSchedules({
    query: { queryKey: reportSchedulesKey(workspaceId) },
  });
  const deleteMutation = useReportsControllerDeleteSchedule({
    mutation: {
      onSuccess: () => {
        toast.success(t('reports.toast.scheduleDeleted'));
        void refetch();
      },
      onError: () => toast.error(t('reports.toast.deleteFailed')),
    },
  });

  const schedules = data ?? [];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('reports.schedules.columns.report')}</TableHead>
          <TableHead>{t('reports.schedules.columns.runs')}</TableHead>
          <TableHead>{t('reports.columns.created')}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {!isLoading && schedules.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              {t('reports.schedules.empty')}
            </TableCell>
          </TableRow>
        )}
        {schedules.map((schedule) => (
          <TableRow key={schedule.id}>
            <TableCell className="font-medium">
              {t(
                schedule.type === 'VULNERABILITY'
                  ? 'reports.generate.vulnerability'
                  : 'reports.generate.summary',
              )}
              {schedule.options.minSeverity && ` · ≥ ${schedule.options.minSeverity}`}
            </TableCell>
            <TableCell>{formatCronLabel(schedule.cron, timezone) ?? schedule.cron}</TableCell>
            <TableCell className="text-muted-foreground">
              {fromNow(schedule.createdAt)}
            </TableCell>
            <TableCell className="text-right">
              <ConfirmDialog
                title={t('reports.schedules.delete.title')}
                description={t('reports.schedules.delete.description')}
                confirmText={t('common.delete')}
                disabled={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate({ id: schedule.id })}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    aria-label={t('reports.schedules.delete.title')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
