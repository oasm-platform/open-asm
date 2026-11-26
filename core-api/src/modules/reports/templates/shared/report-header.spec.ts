/* eslint-disable @typescript-eslint/no-unsafe-return -- spec helpers read untyped query specs */
import { formatDay, reportHeader, riskLevel, trendStats, weekStart } from './report-header';

// Wednesday 2026-11-25 (ISO week 48)
const now = new Date(2026, 10, 25, 14, 30);

describe('reportHeader', () => {
  it('builds title, week, year and padding', () => {
    const h = reportHeader(now, {}, 'Attack Surface Discovery Report');
    expect(h).toMatchObject({
      reportTitle: 'Attack Surface Discovery Report',
      week: 48,
      year: 2026,
      exportedAt: now.toISOString(),
      weekPad: '48',
      systemNameChar: 'O',
    });
    expect(h.formattedDate).toBe(
      now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    );
    expect(h.dateRange).toBeUndefined();
    expect(h.dateRangeLabel).toBeUndefined();
  });

  it('pads single-digit weeks and uses ISO week of year boundaries', () => {
    expect(reportHeader(new Date(2026, 0, 5), {}, 't').weekPad).toBe('02');
    expect(reportHeader(new Date(2021, 0, 1), {}, 't').week).toBe(53);
  });

  it('date range labels', () => {
    const start = new Date(2026, 0, 2);
    const end = new Date(2026, 1, 3);
    expect(reportHeader(now, { startDate: start, endDate: end }, 't')).toMatchObject({
      dateRange: '02 Jan 2026 - 03 Feb 2026',
      dateRangeLabel: 'Date Range',
    });
    expect(reportHeader(now, { startDate: start }, 't')).toMatchObject({
      dateRange: 'From 02 Jan 2026',
      dateRangeLabel: 'Start Date',
    });
    expect(reportHeader(now, { endDate: end }, 't')).toMatchObject({
      dateRange: 'Until 03 Feb 2026',
      dateRangeLabel: 'End Date',
    });
  });
});

describe('weekStart', () => {
  it('is Monday 00:00 local', () => {
    expect(weekStart(now)).toEqual(new Date(2026, 10, 23));
  });
  it('Sunday belongs to the week that began the previous Monday', () => {
    expect(weekStart(new Date(2026, 10, 29, 9))).toEqual(new Date(2026, 10, 23));
  });
});

describe('formatDay', () => {
  it('formats dd/mm/yyyy from a Date or a string', () => {
    expect(formatDay(new Date(2026, 2, 4))).toBe('04/03/2026');
    expect(formatDay(new Date(2026, 2, 4).toISOString())).toBe('04/03/2026');
  });
});

describe('riskLevel', () => {
  it.each([
    [0, 'low'],
    [1, 'low'],
    [2, 'medium'],
    [4, 'medium'],
    [5, 'high'],
    [9, 'high'],
    [10, 'critical'],
  ])('%i findings is %s', (n, level) => {
    expect(riskLevel(n)).toBe(level);
  });
});

describe('trendStats', () => {
  const days = (first: number, second: number) => [...Array(15).fill(first), ...Array(15).fill(second)];

  it('avgPerWeek is the last 7 days total / 7, rounded to one decimal', () => {
    expect(trendStats([], [1, 1, 1, 1, 1, 1, 2]).avgPerWeek).toBe(1.1);
    expect(trendStats([], []).avgPerWeek).toBe(0);
  });

  it('increasing above 1.2x the first half', () => {
    expect(trendStats(days(10, 12.1), []).trend).toBe('increasing');
  });
  it('stable at exactly the 1.2x / 0.8x boundaries', () => {
    expect(trendStats(days(10, 12), []).trend).toBe('stable');
    expect(trendStats(days(10, 8), []).trend).toBe('stable');
  });
  it('decreasing below 0.8x the first half', () => {
    expect(trendStats(days(10, 7.9), []).trend).toBe('decreasing');
  });
  it('empty data is stable', () => {
    expect(trendStats([], []).trend).toBe('stable');
  });
});
