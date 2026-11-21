import { t } from '@/lib/i18n-dictionary';
import { addDays, parse, startOfDay } from 'date-fns';

/** Used until the workspace settings load. */
export const DEFAULT_RISK_ACCEPT_MAX_DAYS = 180;

export const DATE_FORMAT = 'yyyy-MM-dd';

/**
 * Checks a risk-acceptance expiry (yyyy-MM-dd): required, after today, at most
 * `maxDays` ahead. Returns the error to show, or null.
 */
export function validateRiskExpiry(
  value: string,
  maxDays: number,
  today: Date = new Date(),
): string | null {
  if (!value) return t('vulnerabilities.riskExpiry.required');
  const date = parse(value, DATE_FORMAT, today);
  if (Number.isNaN(date.getTime())) return t('vulnerabilities.riskExpiry.invalid');
  const day = startOfDay(date);
  if (day <= startOfDay(today)) return t('vulnerabilities.riskExpiry.future');
  if (day > startOfDay(addDays(today, maxDays)))
    return t('vulnerabilities.riskExpiry.max', { days: maxDays });
  return null;
}
