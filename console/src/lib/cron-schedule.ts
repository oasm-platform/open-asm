/**
 * Cron schedule helpers with timezone support.
 *
 * Cron expressions are always emitted in UTC (standard cron semantics).
 * The builder converts the user-selected LOCAL time (in `timezone`) into
 * the equivalent UTC cron expression using the timezone's current offset.
 */

export type CronFrequency = 'daily' | 'weekly' | 'monthly';

export interface CronScheduleState {
  frequency: CronFrequency;
  /** 1 (Monday) - 7 (Sunday), only used when frequency === 'weekly'. */
  daysOfWeek: number[];
  /** 1-31, only used when frequency === 'monthly'. */
  daysOfMonth: number[];
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
}

export const DEFAULT_CRON_STATE: CronScheduleState = {
  frequency: 'daily',
  daysOfWeek: [],
  daysOfMonth: [],
  hour: 0,
  minute: 0,
};

/** Returns the user's local IANA timezone (e.g. "Asia/Ho_Chi_Minh"). */
export function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Returns the UTC offset of `timezone` at the given date, in minutes. */
export function getTimezoneOffsetMinutes(
  timezone: string,
  date: Date = new Date(),
): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** Returns a label like "(GMT+07:00) Asia/Ho_Chi_Minh". */
export function getTimezoneLabel(timezone: string, date: Date = new Date()): string {
  const offset = getTimezoneOffsetMinutes(timezone, date);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hh = Math.floor(abs / 60).toString().padStart(2, '0');
  const mm = (abs % 60).toString().padStart(2, '0');
  return `(GMT${sign}${hh}:${mm}) ${timezone}`;
}

/**
 * Converts local wall-clock time (hour/minute in `timezone`) into a UTC
 * cron expression. The offset is resolved using `referenceDate` so DST
 * transitions are reflected.
 */
export function buildCronExpression(
  state: CronScheduleState,
  timezone: string,
  referenceDate: Date = new Date(),
): string {
  const offset = getTimezoneOffsetMinutes(timezone, referenceDate);
  const localTotal = state.hour * 60 + state.minute;
  const utcTotal = ((localTotal - offset) % 1440 + 1440) % 1440;
  const hour = Math.floor(utcTotal / 60) % 24;
  const minute = utcTotal % 60;

  const mm = String(minute);
  const hh = String(hour);
  const dow =
    state.frequency === 'weekly' && state.daysOfWeek.length > 0
      ? [...state.daysOfWeek].sort((a, b) => a - b).join(',')
      : '*';
  const dom =
    state.frequency === 'monthly' && state.daysOfMonth.length > 0
      ? [...state.daysOfMonth].sort((a, b) => a - b).join(',')
      : state.frequency === 'monthly'
        ? '1'
        : '*';
  return `${mm} ${hh} ${dom} * ${dow}`;
}

const CRON_RE = /^(\d{1,2}) (\d{1,2}) (\S+) (\S+) (\S+)$/;

/**
 * Parses a 5-field cron expression into form state.
 * When `timezone` is provided, the UTC cron time is converted into the
 * local wall-clock time of that timezone (the inverse of buildCronExpression).
 * Returns null when the expression is not supported.
 */
export function parseCronExpression(
  value: string | undefined,
  timezone?: string,
  referenceDate: Date = new Date(),
): CronScheduleState | null {
  if (!value) return null;
  const match = value.trim().match(CRON_RE);
  if (!match) return null;
  const [, minuteStr, hourStr, dom, , dow] = match;
  const minute = Number(minuteStr);
  const hour = Number(hourStr);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;

  let frequency: CronFrequency;
  let daysOfWeek: number[] = [];
  let daysOfMonth: number[] = [];
  if (dom === '*' && dow === '*') {
    frequency = 'daily';
  } else if (dom === '*' && dow !== '*') {
    frequency = 'weekly';
    const days = dow.split(',').map((d) => Number(d.trim()));
    if (
      days.some((d) => !Number.isInteger(d) || d < 0 || d > 7)
    ) {
      return null;
    }
    daysOfWeek = days.map((d) => (d === 7 ? 0 : d));
  } else if (dom !== '*' && dow === '*') {
    frequency = 'monthly';
    let days: number[];
    if (dom.startsWith('*/')) {
      // Step expression like */3: expand to every Nth day of month.
      const step = Number(dom.slice(2));
      if (!Number.isInteger(step) || step < 1 || step > 31) return null;
      days = [];
      for (let d = 1; d <= 31; d += step) days.push(d);
    } else {
      days = dom.split(',').map((d) => Number(d.trim()));
      if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) {
        return null;
      }
    }
    daysOfMonth = days;
  } else {
    return null;
  }

  const state: CronScheduleState = {
    frequency,
    daysOfWeek,
    daysOfMonth,
    hour,
    minute,
  };

  if (timezone) {
    // Inverse of buildCronExpression: local = utc + offset (mod 1440).
    const offset = getTimezoneOffsetMinutes(timezone, referenceDate);
    const localTotal =
      (((state.hour * 60 + state.minute + offset) % 1440) + 1440) % 1440;
    state.hour = Math.floor(localTotal / 60) % 24;
    state.minute = localTotal % 60;
  }

  return state;
}

/**
 * Computes the next run of the UTC cron expression, returned as the
 * local wall-clock time in `timezone`.
 */
export function getNextRun(
  cron: string,
  timezone: string,
  from: Date = new Date(),
): Date | null {
  const state = parseCronExpression(cron);
  if (!state) return null;

  // Cron is expressed in UTC: convert it to the local wall-clock time in
  // `timezone` (using the reference-day offset) before scanning local days.
  const refOffset = getTimezoneOffsetMinutes(timezone, from);
  const localTotal =
    (((state.hour * 60 + state.minute + refOffset) % 1440) + 1440) % 1440;
  const localHour = Math.floor(localTotal / 60) % 24;
  const localMinute = localTotal % 60;

  // Iterate local calendar days (represented via Date.UTC to avoid DST
  // ambiguity), converting each day's cron time to UTC with that day's offset.
  const startLocal = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
    ),
  );

  for (let day = 0; day < 366; day++) {
    const localDay = new Date(startLocal.getTime() + day * 86400000);
    const offset = getTimezoneOffsetMinutes(timezone, localDay);
    if (state.frequency === 'weekly') {
      const dow = ((localDay.getUTCDay() + 6) % 7) + 1; // 1=Monday ... 7=Sunday
      if (!state.daysOfWeek.includes(dow)) continue;
    } else if (state.frequency === 'monthly') {
      if (!state.daysOfMonth.includes(localDay.getUTCDate())) continue;
    }
    const utcMs =
      localDay.getTime() + (localHour * 60 + localMinute - offset) * 60000;
    if (utcMs > from.getTime()) return new Date(utcMs);
  }
  return null;
}

/** Formats a date as "Mon, Jan 5, 2026, 9:00 AM ICT" in the given timezone. */
export function formatNextRun(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatTime12(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * Renders a human-readable description of a UTC cron expression in the
 * author's `timezone`, e.g. "Every week on Mon, Thu at 8:30 AM".
 * Returns null when the expression is not supported by the builder.
 */
export function formatCronLabel(
  cron: string,
  timezone: string,
  referenceDate: Date = new Date(),
): string | null {
  const state = parseCronExpression(cron);
  if (!state) return null;

  // Cron is in UTC: convert to local wall-clock time in `timezone`, matching
  // the same conversion getNextRun uses so both displays agree.
  const offset = getTimezoneOffsetMinutes(timezone, referenceDate);
  const localTotal =
    (((state.hour * 60 + state.minute + offset) % 1440) + 1440) % 1440;
  const localHour = Math.floor(localTotal / 60) % 24;
  const localMinute = localTotal % 60;
  const time = formatTime12(localHour, localMinute);

  if (state.frequency === 'weekly') {
    const days = [...state.daysOfWeek]
      .sort((a, b) => a - b)
      // Internally Sunday is stored as 0; WEEKDAY_LABELS is 1-indexed (Mon=0).
      .map((d) => WEEKDAY_LABELS[d === 0 ? 6 : d - 1])
      .join(', ');
    return `Every week on ${days} at ${time}`;
  }
  if (state.frequency === 'monthly') {
    const days = [...state.daysOfMonth]
      .sort((a, b) => a - b)
      .join(', ');
    return `Every month on day${state.daysOfMonth.length > 1 ? 's' : ''} ${days} at ${time}`;
  }
  return `Every day at ${time}`;
}
