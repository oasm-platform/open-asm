import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { orvalClient } from '@/services/apis/axios-client';
import {
  DEFAULT_LANGUAGE,
  getLanguage,
  setLanguage,
} from '@/utils/languageState';

export type I18nDictionary = Record<string, Record<string, string>> | null;
export type TVars = Record<string, string | number>;
export type TFunction = (key: string, vars?: TVars) => string;

interface DictionaryResponse {
  lang: string;
  dictionaries: Record<string, Record<string, string>>;
}

const CACHE_PREFIX = 'i18n:';

function readCache(lang: string): string | null {
  try {
    return localStorage.getItem(CACHE_PREFIX + lang);
  } catch {
    return null;
  }
}

function parse(raw: string | null): I18nDictionary {
  try {
    return raw ? (JSON.parse(raw) as I18nDictionary) : null;
  } catch {
    return null;
  }
}

/**
 * The active dictionary lives outside React so `t()` also works in toasts,
 * mutation callbacks and column builders. A version counter tells React
 * when to re-render.
 */
let cachedRaw = readCache(getLanguage());
let dictionary = parse(cachedRaw);
let ready = dictionary !== null;
const listeners = new Set<() => void>();

function emit() {
  // New identity per change so memoised children and deps see it.
  boundT = (key, vars) => t(key, vars);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function fetchDictionary(lang: string): Promise<string> {
  const data = await orvalClient<DictionaryResponse>({
    url: `/api/i18n/${encodeURIComponent(lang)}`,
    method: 'GET',
  });
  const raw = JSON.stringify(data.dictionaries);
  try {
    localStorage.setItem(CACHE_PREFIX + lang, raw);
  } catch {
    // Quota or private mode: the dictionary stays in memory only.
  }
  return raw;
}

/** Swap in a fresh copy of `lang`; re-render only when the text changed. */
async function refresh(lang: string) {
  const raw = await fetchDictionary(lang);
  if (getLanguage() !== lang || raw === cachedRaw) return;
  cachedRaw = raw;
  dictionary = parse(raw);
  emit();
}

/**
 * Boot: a cached dictionary renders at once and is refreshed in the
 * background; without one the boot splash waits for the fetch. A language
 * the API no longer serves falls back to EN.
 */
export async function initI18n(): Promise<void> {
  try {
    await refresh(getLanguage());
  } catch (error) {
    // Only a 404 means the language is gone; a network blip or 5xx keeps the
    // user's choice and whatever copy is cached.
    if (isAxiosError(error) && error.response?.status === 404 && getLanguage() !== DEFAULT_LANGUAGE) {
      setLanguage(DEFAULT_LANGUAGE);
      cachedRaw = readCache(DEFAULT_LANGUAGE);
      dictionary = parse(cachedRaw);
      await refresh(DEFAULT_LANGUAGE).catch(() => undefined);
    }
  } finally {
    if (!ready) {
      ready = true;
      emit();
    }
  }
}

// Every evaluation refreshes, including a Vite HMR reload of this module,
// which would otherwise keep serving the cached copy it booted with.
if (import.meta.env.MODE !== 'test') void initI18n();

// In-flight/fresh fetches started ahead of a switch (see prefetchLanguages).
const prefetched = new Map<string, Promise<string>>();

/** Warm the dictionaries a switch may need, e.g. when the language menu opens. */
export function prefetchLanguages(langs: string[]) {
  for (const lang of langs) {
    if (lang === getLanguage() || prefetched.has(lang)) continue;
    const p = fetchDictionary(lang);
    p.catch(() => prefetched.delete(lang));
    prefetched.set(lang, p);
  }
}

/**
 * Loads the dictionary first, then swaps language + text in one synchronous
 * render inside a view transition, so the page cross-fades instead of
 * flashing raw keys or reflowing text piece by piece.
 */
export async function changeLanguage(lang: string): Promise<void> {
  if (lang === getLanguage()) return;
  const fresh = await prefetched.get(lang)?.catch(() => null);
  prefetched.delete(lang);
  const cached = fresh ? null : readCache(lang);
  const raw = fresh ?? cached ?? (await fetchDictionary(lang));
  const swap = () => {
    cachedRaw = raw;
    dictionary = parse(raw);
    setLanguage(lang);
    flushSync(emit);
  };
  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  if (document.startViewTransition && !reduceMotion) {
    await document.startViewTransition(swap).finished.catch(() => undefined);
  } else {
    swap();
  }
  // A copy from an earlier visit may predate a deploy.
  if (cached) void refresh(lang).catch(() => undefined);
}

/** Tests: install a dictionary synchronously (setup.ts loads EN from core-api). */
export function setDictionaryForTests(dict: I18nDictionary) {
  dictionary = dict;
  cachedRaw = JSON.stringify(dict);
  ready = true;
  emit();
}

/** Each language named in itself, e.g. "Tiếng Việt", "日本語". */
export function nativeName(code: string) {
  try {
    const name =
      new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
    // "español" → "Español"; scripts without case (日本語) stay as they are
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

export function useSupportedLanguages() {
  return useQuery({
    queryKey: ['i18n', 'languages'],
    queryFn: () =>
      orvalClient<string[]>({ url: '/api/i18n/languages', method: 'GET' }),
    staleTime: 60 * 60 * 1000,
  });
}

function lookup(dict: I18nDictionary, key: string, lang: string, vars?: TVars) {
  const dot = key.indexOf('.');
  const table = dict?.[key.slice(0, dot)];
  if (!table) return undefined;
  const name = key.slice(dot + 1);
  // Plural keys are stored as `<key>.one|few|many|other`, picked per CLDR rules.
  if (typeof vars?.count === 'number') {
    const form = new Intl.PluralRules(lang).select(vars.count);
    return table[`${name}.${form}`] ?? table[`${name}.other`] ?? table[name];
  }
  return table[name];
}

/** Pure lookup with {var} interpolation. Missing key → raw key, never throws. */
export function resolveDictText(
  dict: I18nDictionary,
  key: string,
  vars?: TVars,
  lang = DEFAULT_LANGUAGE,
): string {
  const template = lookup(dict, key, lang, vars);
  if (typeof template !== 'string') return key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : m,
  );
}

/** Translate outside React (toasts, callbacks). Components use `useT()`. */
export const t: TFunction = (key, vars) =>
  resolveDictText(dictionary, key, vars, getLanguage());

let boundT: TFunction = (key, vars) => t(key, vars);

/** `t` that re-renders the component when the language changes. */
export function useT(): TFunction {
  return useSyncExternalStore(subscribe, () => boundT);
}

/** False until the first dictionary is usable (cache or network). */
export function useI18nReady() {
  return useSyncExternalStore(subscribe, () => ready);
}

/** A country in the UI language from its ISO code ("RU" → "Россия"). */
export function countryName(code: string | undefined, fallback: string) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return fallback;
  try {
    return (
      new Intl.DisplayNames([getLanguage()], { type: 'region' }).of(code) ??
      fallback
    );
  } catch {
    return fallback;
  }
}
