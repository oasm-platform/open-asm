import { parseTrustedProxies, resolveClientIp } from './trusted-proxies';

describe('parseTrustedProxies', () => {
  it('parses csv, trims and drops empty entries', () => {
    expect(parseTrustedProxies(' 172.16.0.0/12, ,10.0.0.1 ')).toEqual([
      '172.16.0.0/12',
      '10.0.0.1',
    ]);
  });

  it('returns an empty list when unset', () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
  });
});

describe('resolveClientIp', () => {
  const docker = ['172.16.0.0/12'];

  it('returns the peer when no proxy is trusted', () => {
    expect(resolveClientIp('172.19.0.5', '203.0.113.7', [])).toBe(
      '172.19.0.5',
    );
  });

  it('takes the client hop behind a trusted proxy', () => {
    // Cloudflare -> cloudflared (172.19.0.7) -> nginx (peer 172.19.0.5)
    expect(
      resolveClientIp('172.19.0.5', '203.0.113.7, 172.19.0.7', docker),
    ).toBe('203.0.113.7');
  });

  it('never picks a value the client forged on the left', () => {
    expect(
      resolveClientIp(
        '172.19.0.5',
        '1.1.1.1, 203.0.113.7, 172.19.0.7',
        docker,
      ),
    ).toBe('203.0.113.7');
  });

  it('ignores X-Forwarded-For from an untrusted peer', () => {
    expect(resolveClientIp('198.51.100.9', '1.1.1.1', docker)).toBe(
      '198.51.100.9',
    );
  });

  it('falls back to the peer on a malformed hop', () => {
    expect(resolveClientIp('172.19.0.5', 'unknown, 172.19.0.7', docker)).toBe(
      '172.19.0.5',
    );
  });

  it('matches single addresses and IPv6 ranges', () => {
    expect(resolveClientIp('10.0.0.1', '2001:db8::1', ['10.0.0.1'])).toBe(
      '2001:db8::1',
    );
    expect(resolveClientIp('fd00::5', '203.0.113.7', ['fd00::/8'])).toBe(
      '203.0.113.7',
    );
  });

  it('skips invalid trusted entries instead of throwing', () => {
    expect(
      resolveClientIp('172.19.0.5', '203.0.113.7', ['not-an-ip', '10.0.0.0/99']),
    ).toBe('172.19.0.5');
  });
});
