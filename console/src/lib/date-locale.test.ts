import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/utils/languageState';
import { formatDate, fromNow } from './date-locale';

describe('date-locale', () => {
  afterEach(() => setLanguage('en'));

  it('formats in the UI language', () => {
    expect(formatDate('2024-03-05T10:00:00', 'dd MMM yyyy')).toBe('05 Mar 2024');
    setLanguage('vi');
    expect(fromNow(Date.now() - 3 * 3600_000)).toBe('khoảng 3 giờ trước');
  });

  it('returns a dash for missing or invalid dates', () => {
    expect(formatDate(undefined, 'yyyy')).toBe('—');
    expect(fromNow(null)).toBe('—');
    expect(fromNow('not a date')).toBe('—');
  });
});
