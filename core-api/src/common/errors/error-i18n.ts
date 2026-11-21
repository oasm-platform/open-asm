import type { I18nContext } from 'nestjs-i18n';

const PLACEHOLDER = /\{(\w+)\}/g;

interface Template {
  key: string;
  pattern: RegExp;
  names: string[];
}

export interface ErrorMessageMatchers {
  exact: Map<string, string>;
  templates: Template[];
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Indexes the EN `errors` namespace by message. Its values are the exact
 * English text services throw, `{name}` standing for an interpolated part.
 */
export function errorMessageMatchers(
  en: Record<string, string>,
): ErrorMessageMatchers {
  const exact = new Map<string, string>();
  const templates: Template[] = [];
  for (const [key, message] of Object.entries(en)) {
    const names = [...message.matchAll(PLACEHOLDER)].map((m) => m[1]);
    if (!names.length) {
      exact.set(message, key);
      continue;
    }
    const pattern = message
      .split(PLACEHOLDER)
      .map((part, i) => (i % 2 ? '([\\s\\S]*?)' : escape(part)))
      .join('');
    templates.push({ key, pattern: new RegExp(`^${pattern}$`), names });
  }
  // Most literal text first, so "Tool {name} not found" beats "{message}"-like catch-alls
  const literal = (t: Template) => t.pattern.source.replace(/\(\[.*?\)/g, '').length;
  templates.sort((a, b) => literal(b) - literal(a));
  return { exact, templates };
}

let cached: { source: object; matchers: ErrorMessageMatchers } | undefined;

/**
 * The thrown English message in the request's language. Services throw
 * English so gRPC, BullMQ and agent tools keep it; only the HTTP answer is
 * translated. A message without an `errors` entry is returned unchanged.
 */
export function translateErrorMessage(
  message: string,
  i18n: I18nContext | undefined,
): string {
  if (!i18n || i18n.lang === 'en') return message;
  const translations = i18n.service.getTranslations() as Record<
    string,
    Record<string, Record<string, string>> | undefined
  >;
  const en = translations.en?.errors;
  if (!en) return message;
  if (cached?.source !== en) {
    cached = { source: en, matchers: errorMessageMatchers(en) };
  }
  const { exact, templates } = cached.matchers;

  const key = exact.get(message);
  if (key) return i18n.t(`errors.${key}`);
  for (const { key: templateKey, pattern, names } of templates) {
    const match = pattern.exec(message);
    if (!match) continue;
    const args = Object.fromEntries(names.map((name, i) => [name, match[i + 1]]));
    return i18n.t(`errors.${templateKey}`, { args });
  }
  return message;
}
