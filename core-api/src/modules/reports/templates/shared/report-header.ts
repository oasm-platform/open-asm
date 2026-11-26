import type { ReportOptions } from './asq-filters';

function weekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Monday 00:00 (local) of the week containing `now`. */
export function weekStart(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); // Sunday belongs to the previous week
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDay(d: Date | string): string {
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function riskLevel(n: number): 'critical' | 'high' | 'medium' | 'low' {
  if (n >= 10) return 'critical';
  if (n >= 5) return 'high';
  if (n >= 2) return 'medium';
  return 'low';
}

/** Same rule as the old `getVulnerabilityTrends`: second half of 30 days vs the first, ±20%. */
export function trendStats(
  last30: number[],
  last7: number[],
): { avgPerWeek: number; trend: 'increasing' | 'decreasing' | 'stable' } {
  const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
  const mean = (a: number[]) => (a.length > 0 ? sum(a) / a.length : 0);
  const avgPerWeek = last7.length > 0 ? sum(last7) / 7 : 0;
  const firstAvg = mean(last30.slice(0, 15));
  const secondAvg = mean(last30.slice(15));
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (secondAvg > firstAvg * 1.2) trend = 'increasing';
  else if (secondAvg < firstAvg * 0.8) trend = 'decreasing';
  return { avgPerWeek: Math.round(avgPerWeek * 10) / 10, trend };
}

const shortDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function reportHeader(now: Date, o: ReportOptions, title: string) {
  const week = weekNumber(now);
  let dateRange: string | undefined;
  let dateRangeLabel: string | undefined;
  if (o.startDate && o.endDate) {
    dateRange = `${shortDate(o.startDate)} - ${shortDate(o.endDate)}`;
    dateRangeLabel = 'Date Range';
  } else if (o.startDate) {
    dateRange = `From ${shortDate(o.startDate)}`;
    dateRangeLabel = 'Start Date';
  } else if (o.endDate) {
    dateRange = `Until ${shortDate(o.endDate)}`;
    dateRangeLabel = 'End Date';
  }
  return {
    reportTitle: title,
    week,
    year: now.getFullYear(),
    exportedAt: now.toISOString(),
    formattedDate: now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    weekPad: String(week).padStart(2, '0'),
    systemNameChar: 'O',
    dateRange,
    dateRangeLabel,
  };
}
