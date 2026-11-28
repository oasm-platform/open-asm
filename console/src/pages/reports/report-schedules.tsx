import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCronLabel, getLocalTimezone, getNextRun } from '@/lib/cron-schedule';
import { formatDate, fromNow } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import {
  useReportsControllerDeleteSchedule,
  useReportsControllerListSchedules,
} from '@/services/apis/gen/queries';
import { SEVERITY_OPTIONS, TEMPLATE_META } from './report-meta';

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

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const schedules = data ?? [];
  if (schedules.length === 0) {
    return (
      <p className="rounded-xl bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
        {t('reports.schedules.empty')}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {schedules.map((schedule) => {
        const meta = TEMPLATE_META[schedule.type];
        const nextRun = getNextRun(schedule.cron, timezone);
        const severity = SEVERITY_OPTIONS.find((o) => o.value === schedule.options.minSeverity);
        return (
          <li key={schedule.id} className="flex items-start gap-3 rounded-xl bg-muted/40 p-4">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', meta.dot)} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                {t(meta.labelKey)}
                {severity && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('reports.schedules.minSeverity', { level: t(severity.labelKey) })}
                  </span>
                )}
                {(schedule.options.targetIds?.length ?? 0) > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('reports.schedules.targetCount', {
                      count: schedule.options.targetIds?.length ?? 0,
                    })}
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatCronLabel(schedule.cron, timezone) ?? schedule.cron}
              </div>
              {nextRun && (
                <div className="text-xs text-muted-foreground">
                  {t('reports.schedules.nextRun')}{' '}
                  <span className="text-foreground" title={formatDate(nextRun, 'PPpp')}>
                    {fromNow(nextRun)}
                  </span>
                </div>
              )}
            </div>
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
                  className="text-muted-foreground hover:text-destructive"
                >
                  {t('common.delete')}
                </Button>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
