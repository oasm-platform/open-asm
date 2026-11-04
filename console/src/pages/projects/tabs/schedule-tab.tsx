import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatCronLabel,
  getLocalTimezone,
  getNextRun,
  getTimezoneLabel,
} from '@/lib/cron-schedule';
import { cn } from '@/lib/utils';
import {
  ProjectTriggerType,
  useProjectsControllerGetTriggers,
  type ProjectWorkflow,
  type ProjectWorkflowTrigger,
} from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { CalendarClock, CalendarDays, Workflow, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { workflowLabel } from '../project-utils';

dayjs.extend(relativeTime);

const DAYS = 7;

/** Every run of the enabled cron triggers in the next week, by day. */
function useWeek(
  triggers: ProjectWorkflowTrigger[],
  names: Map<string, string>,
  timezone: string,
) {
  return useMemo(() => {
    const start = dayjs().startOf('day');
    const end = start.add(DAYS, 'day').toDate();
    const days = Array.from({ length: DAYS }, (_, i) => ({
      date: start.add(i, 'day'),
      runs: [] as Array<{ at: Date; workflow: string; triggerId: string }>,
    }));
    for (const trigger of triggers) {
      if (trigger.type !== ProjectTriggerType.cron || !trigger.enabled || !trigger.cron) {
        continue;
      }
      let from = new Date();
      for (let guard = 0; guard < 200; guard++) {
        const at = getNextRun(trigger.cron, timezone, from);
        if (!at || at >= end) break;
        const index = dayjs(at).startOf('day').diff(start, 'day');
        days[index]?.runs.push({
          at,
          workflow: names.get(trigger.projectWorkflowId) ?? 'Workflow',
          triggerId: trigger.id,
        });
        from = new Date(at.getTime() + 60_000);
      }
    }
    for (const day of days) day.runs.sort((a, b) => a.at.getTime() - b.at.getTime());
    return days;
  }, [triggers, names, timezone]);
}

/**
 * When the project's workflows run on their own: the next week's scheduled
 * runs and every trigger. Read-only: triggers are set while adding or editing
 * a workflow (they live in its file, `on:`).
 */
export function ScheduleTab({
  projectId,
  workflows,
  archived,
}: {
  projectId: string;
  workflows: ProjectWorkflow[];
  archived: boolean;
}) {
  const timezone = getLocalTimezone();
  const { data: triggers = [], isLoading } = useProjectsControllerGetTriggers(projectId);
  const names = useMemo(
    () => new Map(workflows.map((w) => [w.id, workflowLabel(w.workflow)])),
    [workflows],
  );
  const week = useWeek(archived ? [] : triggers, names, timezone);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-5 text-primary" />
              Next 7 days
            </CardTitle>
            <CardDescription>
              “Assets added” triggers have no fixed time, so they are not shown here.
            </CardDescription>
          </div>
          <span className="text-sm text-muted-foreground">{getTimezoneLabel(timezone)}</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {week.map((day, i) => (
              <div
                key={day.date.toISOString()}
                className={cn(
                  'flex min-h-24 flex-col gap-1.5 rounded-lg border p-2',
                  i === 0 && 'border-primary',
                )}
              >
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{day.date.format('ddd')}</span>{' '}
                  {day.date.format('DD/MM')}
                </span>
                {day.runs.map((run) => (
                  <span
                    key={`${run.triggerId}-${run.at.getTime()}`}
                    className="rounded-md border-l-2 border-primary bg-primary/5 px-2 py-1 text-xs leading-tight"
                  >
                    <span className="block font-medium tabular-nums">
                      {dayjs(run.at).format('HH:mm')}
                    </span>
                    {run.workflow}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <Zap className="size-5 text-primary" />
              Triggers
            </CardTitle>
            <CardDescription>
              Set when each workflow runs while adding or editing it on the
              Workflows tab. Archiving the project stops every trigger until it
              is reopened.
            </CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link to="/projects/$id/$tab" params={{ id: projectId, tab: 'workflows' }}>
              <Workflow className="size-4" />
              Workflows
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Last fired</TableHead>
                  <TableHead>Next</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && triggers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No triggers: workflows run only when started by hand.
                    </TableCell>
                  </TableRow>
                )}
                {triggers.map((trigger) => {
                  const isCron = trigger.type === ProjectTriggerType.cron;
                  const active = trigger.enabled && !archived;
                  const next =
                    isCron && active && trigger.cron ? getNextRun(trigger.cron, timezone) : null;
                  return (
                    <TableRow key={trigger.id}>
                      <TableCell className="font-medium">
                        {names.get(trigger.projectWorkflowId) ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 font-normal">
                          {isCron ? (
                            <CalendarClock className="size-3" />
                          ) : (
                            <Zap className="size-3" />
                          )}
                          {isCron ? 'Schedule' : 'Assets added'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isCron ? (
                          <span className="flex flex-col">
                            {formatCronLabel(trigger.cron ?? '', timezone) ?? trigger.cron}
                            <span className="text-xs text-muted-foreground">
                              {trigger.cron} · UTC
                            </span>
                          </span>
                        ) : (
                          <span className="flex flex-col">
                            Gather {trigger.config.windowMinutes ?? 10} min · up to{' '}
                            {trigger.config.maxAssets ?? 200} assets/run
                            {trigger.config.targetTypes?.length ? (
                              <span className="text-xs text-muted-foreground">
                                only {trigger.config.targetTypes.join(', ').toLowerCase()}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {trigger.lastFiredAt ? dayjs(trigger.lastFiredAt).fromNow() : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {next
                          ? dayjs(next).format('YYYY-MM-DD HH:mm')
                          : isCron || !active
                            ? '—'
                            : 'On new assets'}
                      </TableCell>
                      <TableCell>
                        {active ? (
                          <Badge variant="soft">Active</Badge>
                        ) : (
                          <Badge variant="secondary">{archived ? 'Archived' : 'Off'}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
