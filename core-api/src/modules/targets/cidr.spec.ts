import { cidrsOverlap, formatCidr, parseCidr } from './cidr';

const cidr = (value: string) => {
  const parsed = parseCidr(value);
  if (!parsed) throw new Error(`bad fixture ${value}`);
  return parsed;
};

describe('parseCidr', () => {
  it('clears host bits', () => {
    expect(formatCidr(cidr('203.0.113.17/28'))).toBe('203.0.113.16/28');
    expect(formatCidr(cidr('8.8.8.5/24'))).toBe('8.8.8.0/24');
    expect(formatCidr(cidr('8.8.8.8/32'))).toBe('8.8.8.8/32');
  });

  it('handles the high bit of the first octet', () => {
    expect(formatCidr(cidr('203.0.113.200/26'))).toBe('203.0.113.192/26');
  });

  it('handles /0', () => {
    expect(formatCidr(cidr('203.0.113.1/0'))).toBe('0.0.0.0/0');
  });

  it.each([
    '203.0.113.0',
    '203.0.113.0/33',
    '256.0.113.0/24',
    '203.0.113.0/24/32',
    '',
  ])('rejects %p', (value) => {
    expect(parseCidr(value)).toBeNull();
  });
});

describe('cidrsOverlap', () => {
  it('detects a narrower block inside a wider one, both ways', () => {
    expect(cidrsOverlap(cidr('203.0.113.0/24'), cidr('203.0.113.16/28'))).toBe(
      true,
    );
    expect(cidrsOverlap(cidr('203.0.113.16/28'), cidr('203.0.113.0/24'))).toBe(
      true,
    );
  });

  it('detects the same block written with host bits', () => {
    expect(cidrsOverlap(cidr('8.8.8.5/24'), cidr('8.8.8.0/24'))).toBe(true);
  });

  it('treats adjacent blocks as disjoint', () => {
    expect(cidrsOverlap(cidr('203.0.113.0/28'), cidr('203.0.113.16/28'))).toBe(
      false,
    );
    expect(cidrsOverlap(cidr('203.0.113.0/26'), cidr('203.0.113.64/26'))).toBe(
      false,
    );
    expect(cidrsOverlap(cidr('203.0.113.0/24'), cidr('203.0.114.0/24'))).toBe(
      false,
    );
  });

  it('matches a /32 inside its block only', () => {
    expect(cidrsOverlap(cidr('203.0.113.15/32'), cidr('203.0.113.0/28'))).toBe(
      true,
    );
    expect(cidrsOverlap(cidr('203.0.113.16/32'), cidr('203.0.113.0/28'))).toBe(
      false,
    );
  });
});
