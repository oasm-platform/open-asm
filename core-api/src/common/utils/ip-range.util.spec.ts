import { isIpInRanges, isIpOrCidr } from './ip-range.util';

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
