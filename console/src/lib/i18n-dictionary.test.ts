import { describe, expect, it } from 'vitest';
import { resolveDictText } from './i18n-dictionary';

// Mirrors backend shape: { [namespaceFile]: { [key]: template } }
// e.g. src/i18n/en/ui.json -> dictionaries.ui['notifications.title']
const EN = {
  ui: {
    'notifications.title': 'Notifications',
    'notifications.unread.one': '{count} unread notification',
    'notifications.unread.other': '{count} unread notifications',
    'notifications.markAllRead': 'Mark all as read',
  },
};

const RU = {
  ui: {
    'notifications.unread.one': '{count} непрочитанное уведомление',
    'notifications.unread.few': '{count} непрочитанных уведомления',
    'notifications.unread.many': '{count} непрочитанных уведомлений',
    'notifications.unread.other': '{count} непрочитанного уведомления',
  },
};

describe('resolveDictText', () => {
  it('resolves a namespaced key and picks the plural form', () => {
    expect(resolveDictText(EN, 'ui.notifications.title')).toBe(
      'Notifications',
    );
    expect(resolveDictText(EN, 'ui.notifications.unread', { count: 1 })).toBe(
      '1 unread notification',
    );
    expect(resolveDictText(EN, 'ui.notifications.unread', { count: 3 })).toBe(
      '3 unread notifications',
    );
  });

  it('uses the CLDR plural rules of the language', () => {
    const t = (count: number) =>
      resolveDictText(RU, 'ui.notifications.unread', { count }, 'ru');
    expect(t(1)).toBe('1 непрочитанное уведомление');
    expect(t(3)).toBe('3 непрочитанных уведомления');
    expect(t(5)).toBe('5 непрочитанных уведомлений');
  });

  it('returns the raw key when missing or not loaded', () => {
    expect(resolveDictText(EN, 'ui.notifications.missing')).toBe(
      'ui.notifications.missing',
    );
    expect(resolveDictText(null, 'ui.notifications.title')).toBe(
      'ui.notifications.title',
    );
  });
});
