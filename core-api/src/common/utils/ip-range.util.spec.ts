import {
  isIpInRanges,
  isIpOrCidr,
  isPublicIp,
  unmapIpv4,
} from './ip-range.util';

describe('isPublicIp', () => {
  it.each(['8.8.8.8', '203.0.113.7', '2606:4700::1111', '::ffff:8.8.8.8'])(
    'treats %s as public',
    (ip) => {
      expect(isPublicIp(ip)).toBe(true);
    },
  );

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.0.1',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    '::ffff:127.0.0.1',
  ])('treats %s as local', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it('never treats a missing or malformed address as public', () => {
    expect(isPublicIp(undefined)).toBe(false);
    expect(isPublicIp(null)).toBe(false);
    expect(isPublicIp('')).toBe(false);
    expect(isPublicIp('not-an-ip')).toBe(false);
  });
});

describe('unmapIpv4', () => {
  it('returns the IPv4 address an IPv4-mapped IPv6 address carries', () => {
    expect(unmapIpv4('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(unmapIpv4('::FFFF:203.0.113.7')).toBe('203.0.113.7');
  });

  it('leaves any other address untouched', () => {
    expect(unmapIpv4('203.0.113.7')).toBe('203.0.113.7');
    expect(unmapIpv4('2606:4700::1111')).toBe('2606:4700::1111');
  });
});

describe('isIpOrCidr', () => {
  it.each(['10.0.0.1', '10.0.0.0/8', '2001:db8::1', '2001:db8::/32', '0.0.0.0/0'])(
    'accepts %s',
    (entry) => {
      expect(isIpOrCidr(entry)).toBe(true);
    },
  );

  it.each(['', 'example.com', '10.0.0.0/33', '2001:db8::/129', '10.0.0.0/', '10.0.0.0/8/1', '10.0.0.0/-1', '10.0.0.256'])(
    'rejects %s',
    (entry) => {
      expect(isIpOrCidr(entry)).toBe(false);
    },
  );
});

describe('isIpInRanges', () => {
  it('matches an exact address', () => {
    expect(isIpInRanges('203.0.113.7', ['203.0.113.7'])).toBe(true);
  });

  it('matches an address inside a CIDR range', () => {
    expect(isIpInRanges('10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(isIpInRanges('2001:db8::5', ['2001:db8::/32'])).toBe(true);
  });

  it('does not match an address outside every range', () => {
    expect(isIpInRanges('192.0.2.1', ['10.0.0.0/8', '203.0.113.7'])).toBe(
      false,
    );
  });

  it('matches an IPv4-mapped IPv6 peer against an IPv4 entry', () => {
    expect(isIpInRanges('::ffff:203.0.113.7', ['203.0.113.7'])).toBe(true);
  });

  it('never matches a missing or malformed address', () => {
    expect(isIpInRanges(undefined, ['0.0.0.0/0'])).toBe(false);
    expect(isIpInRanges('not-an-ip', ['0.0.0.0/0'])).toBe(false);
  });
});
