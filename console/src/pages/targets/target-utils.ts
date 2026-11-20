import { t } from '@/lib/i18n-dictionary';
import { CronSchedule } from '@/services/apis/gen/queries';

/** Tabs of a (non Git org) target page, in order; the first is the default. */
export const TARGET_TABS = [
  { value: 'overview', labelKey: 'targets.tabs.overview' },
  { value: 'assets', labelKey: 'targets.tabs.assets' },
  { value: 'vulnerabilities', labelKey: 'targets.tabs.vulnerabilities' },
  { value: 'activity', labelKey: 'targets.tabs.activity' },
  { value: 'settings', labelKey: 'targets.tabs.settings' },
] as const;

export type TargetTab = (typeof TARGET_TABS)[number]['value'];

export const isTargetTab = (tab: string | undefined): tab is TargetTab =>
  TARGET_TABS.some((item) => item.value === tab);

/** Old path tabs and the tab they are now. */
export const LEGACY_TARGET_TABS: Record<string, TargetTab> = {
  inventory: 'assets',
  'asset-services': 'assets',
};

/**
 * Where an old or unknown target URL belongs, or null when it is current.
 * Vulnerabilities used to sit in the asset tab row (`?tab=vulnerabilities`);
 * other asset tabs (`?tab=urls`, from notification links) are kept.
 */
export function targetTabRedirect(
  tab: string,
  innerTab: string | undefined,
): { tab: TargetTab; innerTab: string | undefined } | null {
  const pathTab = isTargetTab(tab) ? tab : LEGACY_TARGET_TABS[tab];
  if (pathTab === 'assets' && innerTab === 'vulnerabilities') {
    return { tab: 'vulnerabilities', innerTab: undefined };
  }
  if (pathTab === tab) return null;
  return pathTab
    ? { tab: pathTab, innerTab }
    : { tab: 'overview', innerTab: undefined };
}

const SCHEDULE_LABELS: Record<string, string> = {
  [CronSchedule.disabled]: 'targets.schedule.disabled',
  [CronSchedule['0_0_*_*_*']]: 'targets.schedule.daily',
  [CronSchedule['0_0_*/3_*_*']]: 'targets.schedule.every3Days',
  [CronSchedule['0_0_*_*_0']]: 'targets.schedule.weekly',
  [CronSchedule['0_0_*/14_*_*']]: 'targets.schedule.every2Weeks',
  [CronSchedule['0_0_1_*_*']]: 'targets.schedule.monthly',
};

/** "Weekly", "Not scheduled"… for a target's scan schedule. */
export function scheduleLabel(schedule?: string | null): string {
  const key = SCHEDULE_LABELS[schedule ?? CronSchedule.disabled];
  return key ? t(key) : (schedule ?? '');
}

export const isScheduled = (schedule?: string | null) =>
  !!schedule && schedule !== CronSchedule.disabled;

/** "3 / 10 jobs" → percent done, 0 when nothing is known yet. */
export const progressPercent = (done: number, total: number) =>
  total > 0 ? Math.round((done / total) * 100) : 0;

/** Days after which a target that was not discovered again counts as stale (as the API). */
export const STALE_DAYS = 30;
