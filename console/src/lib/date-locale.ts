import { format, formatDistanceToNow, isValid, type Locale } from 'date-fns';
import { enUS, es, it, ja, ko, ru, vi, zhCN } from 'date-fns/locale';
import { getLanguage } from '@/utils/languageState';

const DATE_FNS: Record<string, Locale> = { es, it, ja, ko, ru, vi, zh: zhCN };

/** date-fns locale of the UI language, for `formatDistanceToNow` & co. */
export const dateFnsLocale = (): Locale => DATE_FNS[getLanguage()] ?? enUS;

type DateInput = string | number | Date | null | undefined;

const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value ?? NaN));

/** "3 hours ago" / "in 2 days" in the UI language; '—' for a missing or invalid date. */
export const fromNow = (value: DateInput, addSuffix = true): string => {
  const date = toDate(value);
  return isValid(date) ? formatDistanceToNow(date, { addSuffix, locale: dateFnsLocale() }) : '—';
};

/** date-fns `format` (tokens: yyyy, dd, MMM, HH:mm) in the UI language; '—' for a missing or invalid date. */
export const formatDate = (value: DateInput, pattern: string): string => {
  const date = toDate(value);
  return isValid(date) ? format(date, pattern, { locale: dateFnsLocale() }) : '—';
};
