import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/services/apis/axios-client';

export type I18nDictionary = Record<string, Record<string, string>> | null;

interface DictionaryResponse {
  lang: string;
  dictionaries: Record<string, Record<string, string>>;
}

/** Non-blocking: components render EN skeleton text while this loads. */
export function useDictionary(lang = 'en') {
  return useQuery({
    queryKey: ['i18n', lang],
    queryFn: async (): Promise<I18nDictionary> => {
      const { data } = await axiosInstance.get<DictionaryResponse>(
        `/api/i18n/${lang}`,
      );
      return data.dictionaries;
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

/** Pure lookup with {var} interpolation. Missing key → raw key, never throws. */
export function resolveDictText(
  dict: I18nDictionary,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const [ns, ...rest] = key.split('.');
  const template = dict?.[ns]?.[rest.join('.')];
  if (typeof template !== 'string') return key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : m,
  );
}
