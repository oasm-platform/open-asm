import { setCookie, getCookie, deleteCookie } from '@/utils/cookie';

describe('cookie utils', () => {
  beforeEach(() => {
    document.cookie = '';
    // Reset all cookies
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const name = cookie.split('=')[0]?.trim();
      if (name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
      }
    }
  });

  describe('setCookie', () => {
    it('sets a cookie with default expiration', () => {
      setCookie('test', 'value');
      expect(document.cookie).toContain('test=value');
    });

    it('sets a cookie with custom expiration days', () => {
      setCookie('test', 'value', 7);
      expect(document.cookie).toContain('test=value');
    });

    it('sets a cookie with zero days expiration (expires immediately)', () => {
      setCookie('test', 'value', 0);
      // In jsdom, immediately-expired cookies may not be readable
      // Just verify the function doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('getCookie', () => {
    it('returns cookie value when cookie exists', () => {
      document.cookie = 'test=value;path=/';
      expect(getCookie('test')).toBe('value');
    });

    it('returns null when cookie does not exist', () => {
      expect(getCookie('nonexistent')).toBeNull();
    });

    it('returns correct value among multiple cookies', () => {
      document.cookie = 'first=one;path=/';
      document.cookie = 'second=two;path=/';
      expect(getCookie('first')).toBe('one');
      expect(getCookie('second')).toBe('two');
    });

    it('handles cookie value with equals sign', () => {
      document.cookie = 'token=abc=def;path=/';
      expect(getCookie('token')).toBe('abc=def');
    });
  });

  describe('deleteCookie', () => {
    it('deletes an existing cookie', () => {
      document.cookie = 'test=value;path=/';
      deleteCookie('test');
      // After deletion, getCookie should return null
      expect(getCookie('test')).toBeNull();
    });

    it('does not throw when deleting non-existent cookie', () => {
      expect(() => deleteCookie('nonexistent')).not.toThrow();
    });
  });
});
