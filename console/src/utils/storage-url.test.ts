import { describe, expect, it } from 'vitest';
import {
  deriveScreenshotStaleTime,
  resolveClientUrl,
  SCREENSHOT_STALE_TIME_CAP_MS,
} from './storage-url';

describe('resolveClientUrl', () => {
  it('renders absolute https logoPath unchanged', () => {
    const url =
      'https://rustfs.internal/system/logo-1a2b3c.png?X-Amz-Signature=abc';
    expect(resolveClientUrl(url)).toBe(url);
  });

  it('renders absolute http logoPath unchanged', () => {
    const url = 'http://storage.local/system/logo.png';
    expect(resolveClientUrl(url)).toBe(url);
  });

  it('prepends origin for relative logoPath', () => {
    expect(resolveClientUrl('/system/logo.png')).toBe(
      `${window.location.origin}/system/logo.png`,
    );
  });

  it('returns null for null or empty logoPath', () => {
    expect(resolveClientUrl(null)).toBeNull();
    expect(resolveClientUrl('')).toBeNull();
  });
});

describe('deriveScreenshotStaleTime', () => {
  it('derives 80% of a 60s TTL', () => {
    const staleTime = deriveScreenshotStaleTime(60);
    expect(staleTime).toBe(48_000);
    expect(staleTime).toBeLessThan(60_000);
  });

  it('caps long TTLs at 45min', () => {
    const staleTime = deriveScreenshotStaleTime(172800);
    expect(staleTime).toBe(SCREENSHOT_STALE_TIME_CAP_MS);
    expect(staleTime).toBeLessThan(172800 * 1000);
  });

  it('falls back to cap without TTL', () => {
    expect(deriveScreenshotStaleTime(undefined)).toBe(
      SCREENSHOT_STALE_TIME_CAP_MS,
    );
    expect(deriveScreenshotStaleTime(null)).toBe(
      SCREENSHOT_STALE_TIME_CAP_MS,
    );
    expect(deriveScreenshotStaleTime(0)).toBe(SCREENSHOT_STALE_TIME_CAP_MS);
    expect(deriveScreenshotStaleTime(-1)).toBe(SCREENSHOT_STALE_TIME_CAP_MS);
    expect(deriveScreenshotStaleTime(NaN)).toBe(SCREENSHOT_STALE_TIME_CAP_MS);
  });
});
