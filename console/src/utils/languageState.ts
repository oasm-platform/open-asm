import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'lang';
export const DEFAULT_LANGUAGE = 'en';

function readStoredLanguage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * The selected UI language: one value behind the `Accept-Language` header
 * (backend notifications, validation errors) and the console dictionary.
 */
let currentLanguage = readStoredLanguage();
document.documentElement.lang = currentLanguage;
const listeners = new Set<() => void>();

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(lang: string) {
  if (lang === currentLanguage) return;
  currentLanguage = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // private mode: the choice lasts for this tab only
  }
  document.documentElement.lang = lang;
  for (const listener of listeners) listener();
}

export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguage() {
  return useSyncExternalStore(subscribeLanguage, getLanguage);
}
