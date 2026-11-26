import { num } from './batch-result';

const and = (items: unknown[]) => ({ logic: 'and', items });
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

/** One count per severity next to the total: one query gives the whole matrix. */
export const severityMatrix = {
  total: { fn: 'count' },
  ...Object.fromEntries(
    SEVERITIES.map((s) => [s, { fn: 'count', where: and([{ field: 'severity', op: 'eq', value: s }]) }]),
  ),
};

export const matrixOf = (r: Record<string, any>) => ({
  total: num(r.total),
  critical: num(r.critical),
  high: num(r.high),
  medium: num(r.medium),
  low: num(r.low),
  info: num(r.info),
});

/** Points of the old 30-day / 7-day series (start..end inclusive, one per day). */
export const POINTS_30 = 31;
export const POINTS_7 = 8;

/** The last `size` points of the daily series, left-padded with zeros. */
export function lastPoints(series: number[], size: number): number[] {
  const tail = series.slice(-size);
  return [...new Array<number>(size - tail.length).fill(0), ...tail];
}

/** Daily trend rows (`n` per day) as today's `last30Days` / `last7Days` arrays. */
export function trendSeries(rows: Record<string, any>[]): { last30Days: number[]; last7Days: number[] } {
  const last30Days = lastPoints(rows.map((r) => num(r.n)), POINTS_30);
  return { last30Days, last7Days: lastPoints(last30Days, POINTS_7) };
}
