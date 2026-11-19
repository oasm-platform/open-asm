import { describe, expect, it } from 'vitest';
import { resolveDictText } from './i18n-dictionary';

// Mirrors backend shape: { [namespaceFile]: { [key]: template } }
// e.g. src/i18n/en/ui.json -> dictionaries.ui['notifications.title']
const DICT = {
  ui: {
    'notifications.title': 'Notifications',
    'notifications.unread': '{count} unread notification{s}',
    'notifications.markAllRead': 'Mark all as read',
  },
};

describe('resolveDictText', () => {
  it('resolves a namespaced key with variables', () => {
    expect(resolveDictText(DICT, 'ui.notifications.title')).toBe(
      'Notifications',
    );
    expect(
      resolveDictText(DICT, 'ui.notifications.unread', { count: 3, s: 's' }),
    ).toBe('3 unread notifications');
  });

  it('returns the raw key when missing or fetch failed', () => {
    expect(resolveDictText(DICT, 'ui.notifications.missing')).toBe(
      'ui.notifications.missing',
    );
    expect(resolveDictText(null, 'ui.notifications.title')).toBe(
      'ui.notifications.title',
    );
  });
});
