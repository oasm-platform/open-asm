import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { formatDate, fromNow } from '@/lib/date-locale';
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
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import {
  ProjectTriggerType,
  useProjectsControllerGetTriggers,
  type ProjectWorkflow,
  type ProjectWorkflowTrigger,
} from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import { CalendarClock, CalendarDays, Workflow, Zap } from 'lucide-react';
import { useMemo } from 'react';
import {
  eventConditionLabel,
  TRIGGER_EVENT_LABELS,
  workflowLabel,
} from '../project-utils';


const DAYS = 7;

/** Every run of the enabled cron triggers in the next week, by day. */
function useWeek(
  triggers: ProjectWorkflowTrigger[],
  names: Map<string, string>,
  timezone: string,
) {
  const t = useT();
  return useMemo(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, DAYS);
    const days = Array.from({ length: DAYS }, (_, i) => ({
      date: addDays(start, i),
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
        const index = differenceInCalendarDays(at, start);
        days[index]?.runs.push({
          at,
          workflow: names.get(trigger.projectWorkflowId) ?? t('projects.schedule.workflowFallback'),
          triggerId: trigger.id,
        });
        from = new Date(at.getTime() + 60_000);
      }
    }
    for (const day of days) day.runs.sort((a, b) => a.at.getTime() - b.at.getTime());
    return days;
  }, [triggers, names, timezone, t]);
}

/**
 * When the project's workflows run on their own: the next week's scheduled
 * runs and every trigger. Read-only: triggers are set while adding or editing
 * a workflow (they live in its file, `on:`).
 */
/** What an event trigger waits for, and how it gathers its assets. */
function EventCondition({ trigger }: { trigger: ProjectWorkflowTrigger }) {
  const { title, detail } = eventConditionLabel(trigger.event, trigger.config);
  return (
    <span className="flex flex-col">
      {title}
      <span className="text-xs text-muted-foreground">{detail}</span>
    </span>
  );
}

export function ScheduleTab({
  projectId,
  workflows,
  archived,
}: {
  projectId: string;
  workflows: ProjectWorkflow[];
  archived: boolean;
}) {
  const t = useT();
  const timezone = getLocalTimezone();
  const { data: triggers = [], isLoading } = useProjectsControllerGetTriggers(projectId);
  const names = useMemo(
    () => new Map(workflows.map((w) => [w.id, workflowLabel(w.workflow)])),
    [workflows],
  );
  const week = useWeek(archived ? [] : triggers, names, timezone);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-5 text-primary" />
              {t('projects.schedule.next7Days')}
            </CardTitle>
            <CardDescription>
              {t('projects.schedule.next7DaysHint')}
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
                  <span className="font-medium text-foreground">{formatDate(day.date, 'EEE')}</span>{' '}
                  {formatDate(day.date, 'dd/MM')}
                </span>
                {day.runs.map((run) => (
                  <span
                    key={`${run.triggerId}-${run.at.getTime()}`}
                    className="rounded-md border-l-2 border-primary bg-primary/5 px-2 py-1 text-xs leading-tight"
                  >
                    <span className="block font-medium tabular-nums">
                      {formatDate(run.at, 'HH:mm')}
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
              {t('projects.create.steps.triggers')}
            </CardTitle>
            <CardDescription>
              {t('projects.schedule.triggersHint')}
            </CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link to="/projects/$id/$tab" params={{ id: projectId, tab: 'workflows' }}>
              <Workflow className="size-4" />
              {t('projects.tabs.workflows')}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('projects.schedule.colWorkflow')}</TableHead>
                  <TableHead>{t('projects.tabs.runs')}</TableHead>
                  <TableHead>{t('projects.schedule.colCondition')}</TableHead>
                  <TableHead>{t('projects.schedule.colLastFired')}</TableHead>
                  <TableHead>{t('projects.schedule.colNext')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && triggers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      {t('projects.schedule.noTriggers')}
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
                          {isCron
                            ? t('projects.runTrigger.schedule')
                            : trigger.event
                              ? TRIGGER_EVENT_LABELS[trigger.event]
                              : t('projects.runTrigger.event')}
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
                          <EventCondition trigger={trigger} />
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {trigger.lastFiredAt ? fromNow(trigger.lastFiredAt) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {next
                          ? formatDate(next, 'yyyy-MM-dd HH:mm')
                          : isCron || !active
                            ? '—'
                            : t('projects.schedule.onItsEvent')}
                      </TableCell>
                      <TableCell>
                        {active ? (
                          <Badge variant="soft">{t('projects.list.status.active')}</Badge>
                        ) : (
                          <Badge variant="secondary">{archived ? t('projects.archived') : t('projects.schedule.off')}</Badge>
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
