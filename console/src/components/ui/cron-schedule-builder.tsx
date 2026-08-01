import { Clock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CRON_STATE,
  buildCronExpression,
  formatCronLabel,
  formatNextRun,
  getLocalTimezone,
  getNextRun,
  getTimezoneLabel,
  parseCronExpression,
  type CronFrequency,
} from '@/lib/cron-schedule';

export interface CronScheduleChange {
  /** 5-field cron expression in UTC. */
  cron: string;
  /** IANA timezone the cron was authored in. */
  timezone: string;
}

export interface CronScheduleBuilderProps {
  /** Existing cron expression (UTC) to edit. */
  value?: string;
  /** IANA timezone used to convert the local schedule into UTC. */
  timezone?: string;
  onChange: (change: CronScheduleChange) => void;
  /** Called when the user picks a different timezone. */
  onTimezoneChange?: (timezone: string) => void;
  disabled?: boolean;
}

const FREQUENCIES: { value: CronFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** Format a 0-23 hour as 12-hour clock with AM/PM (e.g. 0 -> '12 AM', 13 -> '1 PM'). */
const formatHour = (hour: number) => {
  const hour12 = hour % 12 || 12;
  return `${hour12} ${hour < 12 ? 'AM' : 'PM'}`;
};

const TZ_OPTIONS = [
  'UTC',
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/Moscow',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function CronScheduleBuilder({
  value,
  timezone: timezoneProp = getLocalTimezone(),
  onChange,
  onTimezoneChange,
  disabled,
}: CronScheduleBuilderProps) {
  const initial = useMemo(() => {
    // `value` is only consumed on mount; the Card `key` below remounts this
    // component whenever the parent changes value/timezone.
    const parsed = parseCronExpression(value);
    return parsed ?? { ...DEFAULT_CRON_STATE };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Re-mount when the parent changes the source value/timezone so the
  // controlled form state is rebuilt from the new input.
  const remountKey = `${value ?? ''}|${timezoneProp}`;
  const lastEmitted = useRef<string | null>(null);

  // Default to the device timezone and make sure it (and any explicit
  // `timezone` prop) is always selectable, even when not in TZ_OPTIONS.
  const deviceTimezone = getLocalTimezone();
  const tzOptions = useMemo(() => {
    const extras = Array.from(
      new Set([timezoneProp, deviceTimezone].filter((t) => !TZ_OPTIONS.includes(t))),
    );
    return [...extras, ...TZ_OPTIONS];
  }, [timezoneProp, deviceTimezone]);

  const [frequency, setFrequency] = useState<CronFrequency>(initial.frequency);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial.daysOfWeek);
  const [daysOfMonth, setDaysOfMonth] = useState<number[]>(initial.daysOfMonth);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  // Internal timezone state so the select works even when the parent only
  // provides `onChange` (no controlled timezone prop / onTimezoneChange).
  const [tz, setTz] = useState(timezoneProp);

  const cron = useMemo(
    () =>
      buildCronExpression(
        { frequency, daysOfWeek, daysOfMonth, hour, minute },
        tz,
      ),
    [frequency, daysOfWeek, daysOfMonth, hour, minute, tz],
  );
  const nextRun = useMemo(
    () => getNextRun(cron, tz),
    [cron, tz],
  );
  const cronLabel = useMemo(
    () => formatCronLabel(cron, tz),
    [cron, tz],
  );

  useEffect(() => {
    const emittedKey = `${cron}|${tz}`;
    if (lastEmitted.current === emittedKey) return;
    lastEmitted.current = emittedKey;
    onChange({ cron, timezone: tz });
  }, [cron, tz, onChange]);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleMonthDay = (day: number) => {
    setDaysOfMonth((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  return (
    <Card key={remountKey} className="w-full">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {FREQUENCIES.map((f) => (
            <button
              key={f.value}
              type="button"
              disabled={disabled}
              aria-pressed={frequency === f.value}
              onClick={() => setFrequency(f.value)}
              className={cn(
                buttonVariants({
                  variant: frequency === f.value ? 'default' : 'outline',
                  size: 'sm',
                }),
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {frequency === 'weekly' && (
          <div className="flex flex-wrap items-center gap-2">
            {WEEKDAYS.map((d) => {
              const active = daysOfWeek.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    buttonVariants({
                      variant: active ? 'default' : 'outline',
                      size: 'sm',
                    }),
                    'w-16',
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        )}

        {frequency === 'monthly' && (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">
              Days of month
            </span>
            <div className="grid w-fit grid-cols-7 gap-1.5">
              {MONTH_DAYS.map((d) => {
                const active = daysOfMonth.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    aria-label={`Day ${d}`}
                    onClick={() => toggleMonthDay(d)}
                    className={cn(
                      buttonVariants({
                        variant: active ? 'default' : 'outline',
                        size: 'sm',
                      }),
                      'h-8 w-8',
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7.5rem_7.5rem_1fr]">
          <Select
            disabled={disabled}
            value={String(hour)}
            onValueChange={(v) => setHour(Number(v))}
          >
            <SelectTrigger id="cron-hour" aria-label="Hour" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {formatHour(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            disabled={disabled}
            value={String(minute)}
            onValueChange={(v) => setMinute(Number(v))}
          >
            <SelectTrigger
              id="cron-minute"
              aria-label="Minute"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {String(m).padStart(2, '0')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            disabled={disabled}
            value={tz}
            onValueChange={(v) => {
              setTz(v);
              onTimezoneChange?.(v);
            }}
          >
            <SelectTrigger
              id="cron-timezone"
              aria-label="Timezone"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tzOptions.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {getTimezoneLabel(tz)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Clock className="size-4" />
          <span className="text-foreground">{cronLabel ?? cron}</span>
        </div>

        <div className="text-muted-foreground text-sm">
          {nextRun ? (
            <span>
              Next run:{' '}
              <span className="text-foreground">{formatNextRun(nextRun, tz)}</span>
            </span>
          ) : (
            <span>Schedule not available</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
