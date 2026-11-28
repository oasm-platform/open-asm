import { describe, expect, it } from 'vitest';
import {
  isErrorRequest,
  requestName,
  requestUrl,
  statusText,
  waterfall,
} from './format';

describe('network format', () => {
  it('names a request by its last path segment, like DevTools', () => {
    const base = { method: 'GET', host: 'api.acme.com', port: 443 };
    expect(requestName({ ...base, path: '/v1/users?id=***' })).toBe('users?id=***');
    expect(requestName({ ...base, path: '/v1/users/' })).toBe('users');
    expect(requestName({ ...base, path: '/' })).toBe('/');
    expect(requestName({ ...base, path: '/?q=1' })).toBe('/?q=1');
    expect(requestName({ ...base, path: null })).toBe('/');
    expect(requestName({ ...base, method: null, path: null })).toBe(
      'api.acme.com:443',
    );
  });

  it('leaves the default port out of the URL', () => {
    expect(
      requestUrl({ scheme: 'https', host: 'a.com', port: 443, path: '/x' }),
    ).toBe('https://a.com/x');
    expect(
      requestUrl({ scheme: 'http', host: 'a.com', port: 8080, path: null }),
    ).toBe('http://a.com:8080');
  });

  it('flags blocked, failed and >= 400 requests as errors', () => {
    expect(isErrorRequest({ outcome: 'allowed', statusCode: 200 })).toBe(false);
    expect(isErrorRequest({ outcome: 'allowed', statusCode: 404 })).toBe(true);
    expect(isErrorRequest({ outcome: 'denied', statusCode: null })).toBe(true);
    expect(isErrorRequest({ outcome: 'upstream_error', statusCode: null })).toBe(true);
    expect(isErrorRequest({ outcome: 'cancelled', statusCode: null })).toBe(false);
  });

  it('says why a request has no status code', () => {
    expect(statusText({ outcome: 'allowed', statusCode: 301 })).toEqual({
      kind: 'code',
      code: 301,
    });
    expect(statusText({ outcome: 'denied', statusCode: null }).kind).toBe('blocked');
    expect(statusText({ outcome: 'upstream_error', statusCode: 502 }).kind).toBe(
      'failed',
    );
    expect(statusText({ outcome: 'cancelled', statusCode: null }).kind).toBe(
      'cancelled',
    );
    expect(statusText({ outcome: 'allowed', statusCode: null }).kind).toBe('tunnel');
  });

  it('places each request on one time axis', () => {
    const t0 = Date.parse('2026-11-27T10:00:00.000Z');
    const at = (ms: number) => new Date(t0 + ms).toISOString();
    const bars = waterfall([
      { id: 'a', sentAt: at(0), durationMs: 500 },
      { id: 'b', sentAt: at(500), durationMs: 500 },
      { id: 'c', sentAt: at(1000), durationMs: 0 },
    ]);
    expect(bars.get('a')).toEqual({ left: 0, width: 50 });
    expect(bars.get('b')).toEqual({ left: 50, width: 50 });
    // An instant request still gets a sliver, kept inside the column
    expect(bars.get('c')!.width).toBeGreaterThan(0);
    expect(bars.get('c')!.left + bars.get('c')!.width).toBeLessThanOrEqual(100);
    expect(waterfall([]).size).toBe(0);
  });

  it('places more rows than a call can take as arguments', () => {
    const base = Date.parse('2026-11-27T10:00:00.000Z');
    const many = Array.from({ length: 200_000 }, (_, i) => ({
      id: String(i),
      sentAt: new Date(base + i).toISOString(),
      durationMs: 1,
    }));
    const bars = waterfall(many);
    expect(bars.get('0')!.left).toBe(0);
    expect(bars.size).toBe(200_000);
  });
});
