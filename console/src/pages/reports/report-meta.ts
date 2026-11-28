import {
  addDays,
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { BarChart3, SearchCode, ShieldAlert, type LucideIcon } from 'lucide-react';
import { type DateRange } from 'react-day-picker';

/** Every template a report can come from; the list API filters only the first two. */
export type ReportTemplate = 'SUMMARY' | 'VULNERABILITY' | 'QUERY';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type PeriodPreset = '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'all' | 'custom';

export interface ReportDraft {
  template: ReportTemplate;
  period: PeriodPreset;
  customRange?: DateRange;
  targetIds: string[];
  minSeverity?: Severity;
  savedQueryId?: string;
  repeat: boolean;
  cron: string;
}

export const EMPTY_DRAFT: ReportDraft = {
  template: 'SUMMARY',
  period: '30d',
  targetIds: [],
  repeat: false,
  cron: '',
};

interface TemplateMeta {
  icon: LucideIcon;
  labelKey: string;
  descriptionKey: string;
  /** Tile and badge colours. */
  tone: string;
}

export const TEMPLATE_META: Record<ReportTemplate, TemplateMeta> = {
  SUMMARY: {
    icon: BarChart3,
    labelKey: 'reports.type.summary',
    descriptionKey: 'reports.generate.summaryDescription',
    tone: 'bg-primary/12 text-primary',
  },
  VULNERABILITY: {
    icon: ShieldAlert,
    labelKey: 'reports.type.vulnerability',
    descriptionKey: 'reports.generate.vulnerabilityDescription',
    tone: 'bg-destructive/12 text-destructive',
  },
  QUERY: {
    icon: SearchCode,
    labelKey: 'reports.type.query',
    descriptionKey: 'reports.generate.queryDescription',
    tone: 'bg-chart-2/12 text-chart-2',
  },
};

/** Rows carry the entity's type, which may be a template the generated DTO does not list yet. */
export const templateOf = (type: string): ReportTemplate =>
  type in TEMPLATE_META ? (type as ReportTemplate) : 'SUMMARY';

/** Ordered from the most to the least severe; Info is never listed in a report. */
export const SEVERITY_OPTIONS: { value: Severity; labelKey: string; color: string }[] = [
  { value: 'CRITICAL', labelKey: 'reports.severity.critical', color: 'bg-red-500' },
  { value: 'HIGH', labelKey: 'reports.severity.high', color: 'bg-orange-500' },
  { value: 'MEDIUM', labelKey: 'reports.severity.medium', color: 'bg-yellow-500' },
  { value: 'LOW', labelKey: 'reports.severity.low', color: 'bg-blue-500' },
];

export const PERIOD_PRESETS: { value: PeriodPreset; labelKey: string }[] = [
  { value: '7d', labelKey: 'reports.period.last7Days' },
  { value: '30d', labelKey: 'reports.period.last30Days' },
  { value: 'thisMonth', labelKey: 'reports.period.thisMonth' },
  { value: 'lastMonth', labelKey: 'reports.period.lastMonth' },
  { value: 'all', labelKey: 'reports.period.allTime' },
  { value: 'custom', labelKey: 'reports.period.custom' },
];

/** ISO bounds for a period; both undefined means all data. */
export function periodRange(
  period: PeriodPreset,
  customRange?: DateRange,
  now: Date = new Date(),
): { startDate?: string; endDate?: string } {
  const bounds = (from?: Date, to?: Date) => ({
    startDate: from?.toISOString(),
    endDate: to?.toISOString(),
  });
  switch (period) {
    case '7d':
      return bounds(startOfDay(addDays(now, -7)), now);
    case '30d':
      return bounds(startOfDay(addDays(now, -30)), now);
    case 'thisMonth':
      return bounds(startOfMonth(now), now);
    case 'lastMonth': {
      const previous = subMonths(now, 1);
      return bounds(startOfMonth(previous), endOfMonth(previous));
    }
    case 'custom':
      return bounds(
        customRange?.from && startOfDay(customRange.from),
        customRange?.to && endOfDay(customRange.to),
      );
    case 'all':
      return {};
  }
}
