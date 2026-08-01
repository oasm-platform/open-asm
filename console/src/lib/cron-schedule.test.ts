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

  it('parses weekly with dow list and maps 7 -> 0 (Sunday)', () => {
    expect(parseCronExpression('30 1 * * 1,4,7')).toEqual({
      frequency: 'weekly',
      daysOfWeek: [1, 4, 0],
      daysOfMonth: [],
      hour: 1,
      minute: 30,
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
