import { IntlMessageFormat } from 'intl-messageformat';

const ICU_PATTERN = /\{\w+,\s*(plural|select|selectordinal)\s*,/;

const cache = new Map<string, IntlMessageFormat>();

function getFormatter(template: string, locale: string): IntlMessageFormat {
  const key = `${locale}::${template}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new IntlMessageFormat(template, locale);
    cache.set(key, formatter);
  }
  return formatter;
}

/**
 * Custom formatter for nestjs-i18n that supports ICU MessageFormat
 * (plural, select, selectordinal) in addition to simple {variable} interpolation.
 */
export function icuFormatter(
  template: string,
  ...args: unknown[]
): string {
  const values: Record<string, unknown> = {};

  for (const arg of args) {
    if (typeof arg === 'object' && arg !== null) {
      Object.assign(values, arg as Record<string, unknown>);
    }
  }

  if (ICU_PATTERN.test(template)) {
    try {
      const numericValues: Record<string, unknown> = { ...values };
      for (const key of Object.keys(numericValues)) {
        const raw = numericValues[key];
        if (typeof raw === 'string' && raw !== '') {
          const num = Number(raw);
          if (!isNaN(num)) {
            numericValues[key] = num;
          }
        }
      }

      const msg = getFormatter(template, 'en');
      return msg.format(numericValues) as string;
    } catch {
      // Fall through to simple interpolation
    }
  }

  return template.replace(/\{(\w+)\}/g, (_: string, key: string) => {
    const val = values[key];
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
    return `{${key}}`;
  });
}
