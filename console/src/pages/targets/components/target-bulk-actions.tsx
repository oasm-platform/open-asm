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

const targetCount = (n: number) => `${n} target${n === 1 ? '' : 's'}`;

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
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { mutateAsync: rescan } = useTargetsControllerReScanTarget();
  const { mutateAsync: update } = useTargetsControllerUpdateTarget();
  const { mutateAsync: remove } = useTargetsControllerDeleteTarget();

  const run = async (
    verb: string,
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
      failed ? `${failed} failed` : '',
      skipped ? `${skipped} skipped (scan running)` : '',
    ].filter(Boolean);
    const message = `${verb} ${targetCount(done)}${notes.length ? ` · ${notes.join(', ')}` : ''}`;
    if (failed) toast.error(message);
    else toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ['targets'] });
    onDone();
  };

  // The list reports the computed job status (typed as the older ScanStatus).
  const idle = targets.filter((t) => String(t.status) === JobStatus.completed);

  return (
    <div className="flex flex-wrap items-center gap-2 normal-case">
      <span className="text-sm font-medium">{targetCount(targets.length)} selected</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={busy || idle.length === 0}
        onClick={() =>
          void run(
            'Re-discovery started for',
            idle,
            (t) => rescan({ id: t.id }),
            targets.length - idle.length,
          )
        }
      >
        <RefreshCw className="size-3.5" />
        Re-discover
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-7" disabled={busy}>
            <CalendarClock className="size-3.5" />
            Schedule
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Scan schedule</DropdownMenuLabel>
          {SCHEDULES.map((schedule) => (
            <DropdownMenuItem
              key={schedule}
              onSelect={() =>
                void run('Schedule set on', targets, (t) =>
                  update({ id: t.id, data: { scanSchedule: schedule } }),
                )
              }
            >
              {scheduleLabel(schedule)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        title={`Delete ${targetCount(targets.length)}`}
        description="This permanently deletes the selected targets with their assets, vulnerabilities and scan history."
        typeToConfirm="delete"
        onConfirm={() => void run('Deleted', targets, (t) => remove({ id: t.id }))}
        trigger={
          <Button size="sm" variant="outline" className="h-7 text-destructive" disabled={busy}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        }
      />
      <Button size="sm" variant="ghost" className="h-7" onClick={onDone} aria-label="Clear selection">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
