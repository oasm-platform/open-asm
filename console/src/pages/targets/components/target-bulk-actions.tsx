import { useT } from '@/lib/i18n-dictionary';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CronSchedule,
  JobStatus,
  useTargetsControllerDeleteTarget,
  useTargetsControllerReScanTarget,
  useTargetsControllerUpdateTarget,
  type GetManyTargetResponseDto,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { scheduleLabel } from '../target-utils';

const SCHEDULES = Object.values(CronSchedule);

/**
 * Actions on the selected rows of the target list. Each one calls the
 * single-target endpoint per target and reports how many went through.
 */
export function TargetBulkActions({
  targets,
  onDone,
}: {
  targets: GetManyTargetResponseDto[];
  onDone: () => void;
}) {
  const t = useT();
  const targetCount = (count: number) => t('targets.bulk.count', { count });
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { mutateAsync: rescan } = useTargetsControllerReScanTarget();
  const { mutateAsync: update } = useTargetsControllerUpdateTarget();
  const { mutateAsync: remove } = useTargetsControllerDeleteTarget();

  const run = async (
    verbKey: string,
    items: GetManyTargetResponseDto[],
    action: (target: GetManyTargetResponseDto) => Promise<unknown>,
    skipped = 0,
  ) => {
    setBusy(true);
    const results = await Promise.allSettled(items.map(action));
    setBusy(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    const done = results.length - failed;
    const notes = [
      failed ? t('targets.bulk.failed', { count: failed }) : '',
      skipped ? t('targets.bulk.skipped', { count: skipped }) : '',
    ].filter(Boolean);
    const message = `${t(verbKey, { targets: targetCount(done) })}${notes.length ? ` · ${notes.join(', ')}` : ''}`;
    if (failed) toast.error(message);
    else toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ['targets'] });
    onDone();
  };

  // The list reports the computed job status (typed as the older ScanStatus).
  const idle = targets.filter((target) => String(target.status) === JobStatus.completed);

  return (
    <div className="flex flex-wrap items-center gap-2 normal-case">
      <span className="text-sm font-medium">{t('targets.bulk.selected', { targets: targetCount(targets.length) })}</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={busy || idle.length === 0}
        onClick={() =>
          void run(
            'targets.bulk.rediscoveryStarted',
            idle,
            (target) => rescan({ id: target.id }),
            targets.length - idle.length,
          )
        }
      >
        <RefreshCw className="size-3.5" />
        {t('targets.bulk.rediscover')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-7" disabled={busy}>
            <CalendarClock className="size-3.5" />
            {t('targets.bulk.schedule')}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t('targets.bulk.scanSchedule')}</DropdownMenuLabel>
          {SCHEDULES.map((schedule) => (
            <DropdownMenuItem
              key={schedule}
              onSelect={() =>
                void run('targets.bulk.scheduleSet', targets, (target) =>
                  update({ id: target.id, data: { scanSchedule: schedule } }),
                )
              }
            >
              {scheduleLabel(schedule)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        title={t('targets.bulk.deleteTitle', { targets: targetCount(targets.length) })}
        description={t('targets.bulk.deleteDescription')}
        typeToConfirm="delete"
        onConfirm={() => void run('targets.bulk.deleted', targets, (target) => remove({ id: target.id }))}
        trigger={
          <Button size="sm" variant="outline" className="h-7 text-destructive" disabled={busy}>
            <Trash2 className="size-3.5" />
            {t('common.delete')}
          </Button>
        }
      />
      <Button size="sm" variant="ghost" className="h-7" onClick={onDone} aria-label={t('targets.bulk.clearSelection')}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
