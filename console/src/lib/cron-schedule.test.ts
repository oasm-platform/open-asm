import { describe, expect, it } from 'vitest';
import {
  buildCronExpression,
  formatCronLabel,
  formatNextRun,
  getNextRun,
  getTimezoneLabel,
  getTimezoneOffsetMinutes,
  parseCronExpression,
  type CronScheduleState,
} from '@/lib/cron-schedule';

const at = (iso: string) => new Date(iso);

describe('buildCronExpression', () => {
  it('daily 09:00 Asia/Ho_Chi_Minh (+07) emits UTC 02:00', () => {
    const state: CronScheduleState = {
      frequency: 'daily',
      daysOfWeek: [],
      daysOfMonth: [],
      hour: 9,
      minute: 0,
    };
    expect(buildCronExpression(state, 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      '0 2 * * *',
    );
  });

  it('weekly Mon+Thu 08:30 Asia/Ho_Chi_Minh emits UTC dow list', () => {
    const state: CronScheduleState = {
      frequency: 'weekly',
      daysOfWeek: [1, 4],
      daysOfMonth: [],
      hour: 8,
      minute: 30,
    };
    expect(buildCronExpression(state, 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      '30 1 * * 1,4',
    );
  });

  it('monthly first day 00:00 UTC emits dom=1', () => {
    const state: CronScheduleState = {
      frequency: 'monthly',
      daysOfWeek: [],
      daysOfMonth: [1],
      hour: 0,
      minute: 0,
    };
    expect(buildCronExpression(state, 'UTC', at('2026-01-15T00:00:00Z'))).toBe(
      '0 0 1 * *',
    );
  });

  it('monthly with multiple days emits sorted dom list', () => {
    const state: CronScheduleState = {
      frequency: 'monthly',
      daysOfWeek: [],
      daysOfMonth: [18, 1, 26, 10, 11, 28],
      hour: 0,
      minute: 0,
    };
    expect(buildCronExpression(state, 'UTC', at('2026-01-15T00:00:00Z'))).toBe(
      '0 0 1,10,11,18,26,28 * *',
    );
  });

  it('UTC timezone passes the local time through unchanged', () => {
    const state: CronScheduleState = {
      frequency: 'daily',
      daysOfWeek: [],
      daysOfMonth: [],
      hour: 23,
      minute: 45,
    };
    expect(buildCronExpression(state, 'UTC', at('2026-01-15T00:00:00Z'))).toBe(
      '45 23 * * *',
    );
  });

  it('wraps negative hour (00:30 +07 -> previous UTC day 17:30)', () => {
    const state: CronScheduleState = {
      frequency: 'daily',
      daysOfWeek: [],
      daysOfMonth: [],
      hour: 0,
      minute: 30,
    };
    expect(buildCronExpression(state, 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      '30 17 * * *',
    );
  });

  it('half-hour offset (Asia/Kolkata +05:30) still emits valid minutes', () => {
    const state: CronScheduleState = {
      frequency: 'daily',
      daysOfWeek: [],
      daysOfMonth: [],
      hour: 9,
      minute: 0,
    };
    expect(buildCronExpression(state, 'Asia/Kolkata', at('2026-01-15T00:00:00Z'))).toBe(
      '30 3 * * *',
    );
  });

  it('shifts weekdays back one day when local time crosses midnight into UTC', () => {
    // Local Mon+Thu 00:00 in +07 is UTC Sun+Wed 17:00 the previous day.
    const state: CronScheduleState = {
      frequency: 'weekly',
      daysOfWeek: [1, 4],
      daysOfMonth: [],
      hour: 0,
      minute: 0,
    };
    expect(buildCronExpression(state, 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      '0 17 * * 3,7',
    );
  });

  it('shifts and drops days-of-month when local time crosses midnight into UTC', () => {
    // Local day 1,10,26 00:00 in +07 -> UTC 17:00 on days 0,9,25; day 0
    // (previous month) cannot be expressed, so it is dropped.
    const state: CronScheduleState = {
      frequency: 'monthly',
      daysOfWeek: [],
      daysOfMonth: [1, 10, 26],
      hour: 0,
      minute: 0,
    };
    expect(buildCronExpression(state, 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      '0 17 9,25 * *',
    );
  });

  it('shifts weekdays forward for negative offsets', () => {
    // Local Tue 23:30 in UTC-5 is Wed 04:30 UTC the next day.
    const state: CronScheduleState = {
      frequency: 'weekly',
      daysOfWeek: [2],
      daysOfMonth: [],
      hour: 23,
      minute: 30,
    };
    expect(buildCronExpression(state, 'America/New_York', at('2026-01-15T00:00:00Z'))).toBe(
      '30 4 * * 3',
    );
  });
});

describe('parseCronExpression', () => {
  it('parses daily', () => {
    expect(parseCronExpression('0 2 * * *')).toEqual({
      frequency: 'daily',
      daysOfWeek: [],
      daysOfMonth: [],
      hour: 2,
      minute: 0,
    });
  });

  it('parses weekly with dow list and keeps Sunday as 7', () => {
    expect(parseCronExpression('30 1 * * 1,4,7')).toEqual({
      frequency: 'weekly',
      daysOfWeek: [1, 4, 7],
      daysOfMonth: [],
      hour: 1,
      minute: 30,
    });
  });

  it('normalizes cron dow 0 (Sunday) to 7', () => {
    expect(parseCronExpression('0 0 * * 0')).toEqual({
      frequency: 'weekly',
      daysOfWeek: [7],
      daysOfMonth: [],
      hour: 0,
      minute: 0,
    });
  });

  it('parses monthly', () => {
    expect(parseCronExpression('0 9 1 * *')).toEqual({
      frequency: 'monthly',
      daysOfWeek: [],
      daysOfMonth: [1],
      hour: 9,
      minute: 0,
    });
  });

  it('parses monthly with dom list', () => {
    expect(parseCronExpression('0 9 1,10,11,18,26,28 * *')).toEqual({
      frequency: 'monthly',
      daysOfWeek: [],
      daysOfMonth: [1, 10, 11, 18, 26, 28],
      hour: 9,
      minute: 0,
    });
  });

  it('expands dom step */3 to its matching days (every 3 days)', () => {
    expect(parseCronExpression('0 0 */3 * *')).toEqual({
      frequency: 'monthly',
      daysOfWeek: [],
      daysOfMonth: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31],
      hour: 0,
      minute: 0,
    });
  });

  it('expands dom step */14 (every 2 weeks)', () => {
    expect(parseCronExpression('0 0 */14 * *')).toEqual({
      frequency: 'monthly',
      daysOfWeek: [],
      daysOfMonth: [1, 15, 29],
      hour: 0,
      minute: 0,
    });
  });

  it('rejects unsupported / malformed expressions', () => {
    expect(parseCronExpression(undefined)).toBeNull();
    expect(parseCronExpression('')).toBeNull();
    expect(parseCronExpression('*/5 * * * *')).toBeNull();
    expect(parseCronExpression('0 25 * * *')).toBeNull();
    expect(parseCronExpression('0 2 15 * 1')).toBeNull(); // fixed dom + dow combo
  });

  it('converts UTC cron time into local wall-clock time for a timezone', () => {
    // 03:00 UTC is 10:00 local in Asia/Ho_Chi_Minh (+07)
    expect(parseCronExpression('0 3 * * *', 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toEqual(
      {
        frequency: 'daily',
        daysOfWeek: [],
        daysOfMonth: [],
        hour: 10,
        minute: 0,
      },
    );
  });

  it('wraps UTC time back into the same day for negative offsets', () => {
    // 03:00 UTC is 22:00 local in America/New_York (UTC-5, previous calendar day)
    expect(parseCronExpression('0 3 * * *', 'America/New_York', at('2026-01-15T00:00:00Z'))).toEqual(
      {
        frequency: 'daily',
        daysOfWeek: [],
        daysOfMonth: [],
        hour: 22,
        minute: 0,
      },
    );
  });

  it('shifts weekdays when the UTC->local conversion crosses midnight', () => {
    // 17:00 UTC Sunday is 00:00 local Monday in +07: the local day shifts +1.
    expect(
      parseCronExpression('0 17 * * 7', 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z')),
    ).toEqual({
      frequency: 'weekly',
      daysOfWeek: [1],
      daysOfMonth: [],
      hour: 0,
      minute: 0,
    });
  });

  it('shifts days-of-month with the local day and drops out-of-range values', () => {
    // 17:00 UTC on days 1,9,25 is 00:00 local (+07) on days 2,10,26.
    expect(parseCronExpression('0 17 1,9,25 * *', 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toEqual(
      {
        frequency: 'monthly',
        daysOfWeek: [],
        daysOfMonth: [2, 10, 26],
        hour: 0,
        minute: 0,
      },
    );
    // 03:00 UTC on the 1st is 22:00 local the PREVIOUS day in UTC-5; the
    // shifted dom (0) cannot be represented, so it is dropped.
    expect(parseCronExpression('0 3 1,15 * *', 'America/New_York', at('2026-01-15T00:00:00Z'))).toEqual(
      {
        frequency: 'monthly',
        daysOfWeek: [],
        daysOfMonth: [14],
        hour: 22,
        minute: 0,
      },
    );
  });
});

describe('getTimezoneOffsetMinutes', () => {
  it('UTC offset is 0', () => {
    expect(getTimezoneOffsetMinutes('UTC', at('2026-01-15T00:00:00Z'))).toBe(0);
  });

  it('Asia/Ho_Chi_Minh is +420 in January', () => {
    expect(getTimezoneOffsetMinutes('Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      420,
    );
  });

  it('America/New_York is -300 in January (EST) and -240 in July (EDT)', () => {
    expect(getTimezoneOffsetMinutes('America/New_York', at('2026-01-15T00:00:00Z'))).toBe(
      -300,
    );
    expect(getTimezoneOffsetMinutes('America/New_York', at('2026-07-15T00:00:00Z'))).toBe(
      -240,
    );
  });
});

describe('getTimezoneLabel', () => {
  it('formats label with GMT offset', () => {
    expect(getTimezoneLabel('Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      '(GMT+07:00) Asia/Ho_Chi_Minh',
    );
  });
});

describe('getNextRun', () => {
  it('daily 09:00 local (+07) next run is same day local 09:00', () => {
    const from = at('2026-01-15T01:00:00Z'); // 08:00 local
    const next = getNextRun('0 2 * * *', 'Asia/Ho_Chi_Minh', from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(at('2026-01-15T02:00:00Z').getTime());
  });

  it('daily 09:00 local (+07) skips ahead when already past', () => {
    const from = at('2026-01-15T03:00:00Z'); // 10:00 local
    const next = getNextRun('0 2 * * *', 'Asia/Ho_Chi_Minh', from);
    expect(next!.getTime()).toBe(at('2026-01-16T02:00:00Z').getTime());
  });

  it('weekly Mon 09:00 local finds next Monday', () => {
    const from = at('2026-01-15T00:00:00Z'); // Thursday local
    const next = getNextRun('0 2 * * 1', 'Asia/Ho_Chi_Minh', from);
    const local = new Date(next!.getTime() + 7 * 3600000);
    expect(local.getUTCDay()).toBe(1); // Monday
    expect(next!.getTime()).toBe(at('2026-01-19T02:00:00Z').getTime());
  });

  it('monthly days 10/18 finds the next matching day', () => {
    const from = at('2026-01-15T00:00:00Z');
    const next = getNextRun('0 0 10,18 * *', 'UTC', from);
    // 2026-01-15 -> next match is Jan 18 00:00 UTC
    expect(next!.getTime()).toBe(at('2026-01-18T00:00:00Z').getTime());
  });

  it('every-3-days finds the next matching day (from Jan 15 -> Jan 16)', () => {
    const from = at('2026-01-15T00:00:00Z');
    const next = getNextRun('0 0 */3 * *', 'UTC', from);
    // */3 matches days 1,4,7,...,28,31 -> next after Jan 15 is Jan 16
    expect(next!.getTime()).toBe(at('2026-01-16T00:00:00Z').getTime());
  });

  it('weekly Sunday cron (dow 7) finds the next Sunday', () => {
    // 2026-01-15 is a Thursday; the next Sunday is Jan 18.
    const from = at('2026-01-15T00:00:00Z');
    const next = getNextRun('0 0 * * 7', 'UTC', from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(at('2026-01-18T00:00:00Z').getTime());
  });

  it('does not skip a run whose local calendar day lags the UTC date', () => {
    // 04:00 UTC on the 15th is 23:00 local (UTC-5) on the 14th. The run on
    // 2026-01-15T04:00Z is still after `from` but lands on the local day
    // BEFORE `from`'s UTC date, so the scan must start one day earlier.
    const from = at('2026-01-15T02:00:00Z');
    const next = getNextRun('0 4 15 * *', 'America/New_York', from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(at('2026-01-15T04:00:00Z').getTime());
  });

  it('weekly cron with a Sunday dow matches in a positive-offset zone', () => {
    // 17:00 UTC Sunday is 00:00 local Monday in +07; from a Thursday the
    // next run is Sunday 17:00 UTC.
    const from = at('2026-01-15T00:00:00Z');
    const next = getNextRun('0 17 * * 7', 'Asia/Ho_Chi_Minh', from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(at('2026-01-18T17:00:00Z').getTime());
  });
});

describe('formatNextRun', () => {
  it('renders local time with tz abbreviation', () => {
    const text = formatNextRun(at('2026-01-15T02:00:00Z'), 'Asia/Ho_Chi_Minh');
    expect(text).toContain('9:00 AM');
    expect(text).toMatch(/ICT|GMT\+7/);
  });
});

describe('formatCronLabel', () => {
  it('daily UTC 02:00 renders as local 9:00 AM in Asia/Ho_Chi_Minh', () => {
    expect(formatCronLabel('0 2 * * *', 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      'Every day at 9:00 AM',
    );
  });

  it('daily PM time renders with PM period', () => {
    expect(formatCronLabel('30 17 * * *', 'UTC', at('2026-01-15T00:00:00Z'))).toBe(
      'Every day at 5:30 PM',
    );
  });

  it('weekly Mon+Thu renders weekday names in order', () => {
    expect(formatCronLabel('30 1 * * 1,4', 'Asia/Ho_Chi_Minh', at('2026-01-15T00:00:00Z'))).toBe(
      'Every week on Mon, Thu at 8:30 AM',
    );
  });

  it('weekly Sunday cron dow 7 renders as Sun', () => {
    expect(formatCronLabel('0 0 * * 7', 'UTC', at('2026-01-15T00:00:00Z'))).toBe(
      'Every week on Sun at 12:00 AM',
    );
  });

  it('monthly single day renders singular', () => {
    expect(formatCronLabel('0 9 5 * *', 'UTC', at('2026-01-15T00:00:00Z'))).toBe(
      'Every month on day 5 at 9:00 AM',
    );
  });

  it('monthly multiple days renders plural list', () => {
    expect(formatCronLabel('0 0 10,18 * *', 'UTC', at('2026-01-15T00:00:00Z'))).toBe(
      'Every month on days 10, 18 at 12:00 AM',
    );
  });

  it('returns null for unsupported cron', () => {
    expect(formatCronLabel('*/5 * * * *', 'UTC')).toBeNull();
  });
});
