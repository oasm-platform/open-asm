import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { orvalClient } from '@/services/apis/axios-client';
import { DEFAULT_LANGUAGE, useLanguage } from '@/utils/languageState';

export type I18nDictionary = Record<string, Record<string, string>> | null;
type Vars = Record<string, string | number>;

interface DictionaryResponse {
  lang: string;
  dictionaries: Record<string, Record<string, string>>;
}

/** Non-blocking: components render the raw key/EN text while this loads. */
export function useDictionary(lang = DEFAULT_LANGUAGE) {
  return useQuery({
    queryKey: ['i18n', lang],
    queryFn: async (): Promise<I18nDictionary> => {
      // The axios interceptor already unwraps the body.
      const data = await orvalClient<DictionaryResponse>({
        url: `/api/i18n/${encodeURIComponent(lang)}`,
        method: 'GET',
      });
      return data.dictionaries;
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export function useSupportedLanguages() {
  return useQuery({
    queryKey: ['i18n', 'languages'],
    queryFn: () =>
      orvalClient<string[]>({ url: '/api/i18n/languages', method: 'GET' }),
    staleTime: 60 * 60 * 1000,
  });
}

function lookup(dict: I18nDictionary, key: string, lang: string, vars?: Vars) {
  const [ns, ...rest] = key.split('.');
  const table = dict?.[ns];
  if (!table) return undefined;
  const name = rest.join('.');
  // Plural keys are stored as `<key>.one|few|many|other`, picked per CLDR rules.
  if (typeof vars?.count === 'number') {
    const form = new Intl.PluralRules(lang).select(vars.count);
    return table[`${name}.${form}`] ?? table[`${name}.other`] ?? table[name];
  }
  return table[name];
}

/**
 * Pure lookup with {var} interpolation. Falls back to the EN dictionary, then
 * to the raw key; never throws.
 */
export function resolveDictText(
  dict: I18nDictionary,
  key: string,
  vars?: Vars,
  lang = DEFAULT_LANGUAGE,
  fallback: I18nDictionary = null,
): string {
  const template =
    lookup(dict, key, lang, vars) ??
    lookup(fallback, key, DEFAULT_LANGUAGE, vars);
  if (typeof template !== 'string') return key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : m,
  );
}

/** `t(key, vars)` for the selected language, EN as fallback. */
export function useT() {
  const lang = useLanguage();
  const { data: dict } = useDictionary(lang);
  const { data: en } = useDictionary(DEFAULT_LANGUAGE);
  return useCallback(
    (key: string, vars?: Vars) =>
      resolveDictText(dict ?? null, key, vars, lang, en ?? null),
    [dict, en, lang],
  );
}
