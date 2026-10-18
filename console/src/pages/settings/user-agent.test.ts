import { describe, expect, it } from 'vitest';
import { parseUserAgent } from './user-agent';

describe('parseUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79',
      { client: 'Edge 129.0.2792.79', isBrowser: true, os: 'Windows 10', deviceType: 'Desktop', device: undefined },
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
      { client: 'Chrome 129.0.6668.69', os: 'iOS 17.4.1', deviceType: 'Mobile', device: 'Apple iPhone' },
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
      { client: 'Samsung Internet 25.0', os: 'Android 14', deviceType: 'Mobile', device: 'Samsung SM-S918B' },
    ],
    ['curl/8.4.0', { client: 'curl 8.4.0', isBrowser: false, deviceType: 'API client' }],
    ['Go-http-client/1.1', { client: 'Go-http-client 1.1', isBrowser: false, deviceType: 'API client' }],
  ])('%s', (ua, expected) => {
    expect(parseUserAgent(ua)).toMatchObject(expected);
  });
});
