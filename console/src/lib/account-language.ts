import { useEffect } from 'react';
import { changeLanguage } from '@/lib/i18n-dictionary';
import { authClient } from '@/utils/authClient';

/**
 * A language picked on a signed-out screen (login, init admin). It beats the
 * account's saved language on the next sign-in and is saved onto it.
 * shortcut: in memory only, so a full reload between picking and signing in
 * drops it; move it to sessionStorage if that turns out to matter.
 */
let pickedSignedOut: string | null = null;

export function pickLanguageSignedOut(lang: string): Promise<void> {
  pickedSignedOut = lang;
  return changeLanguage(lang);
}

/** Switch the UI and store the choice on the account. */
export async function saveAccountLanguage(lang: string): Promise<void> {
  await changeLanguage(lang);
  // Best effort: the UI already switched; only other devices miss out.
  await authClient.updateUser({ language: lang }).catch(() => undefined);
}

/**
 * Follows the signed-in account's language. Keyed on the account value only,
 * so a local switch is not undone while its save is in flight.
 */
export function useAccountLanguage(accountLanguage: string | undefined) {
  useEffect(() => {
    if (!accountLanguage) return;
    const picked = pickedSignedOut;
    pickedSignedOut = null;
    if (picked && picked !== accountLanguage) {
      void authClient.updateUser({ language: picked }).catch(() => undefined);
      return;
    }
    // A language the API no longer serves keeps the current one.
    changeLanguage(accountLanguage).catch(() => undefined);
  }, [accountLanguage]);
}
