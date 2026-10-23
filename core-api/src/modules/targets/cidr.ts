/**
 * IPv4 CIDR arithmetic for CIDR targets.
 *
 * A block is kept as its network address (host bits cleared) and prefix, so
 * `203.0.113.17/28` and `203.0.113.16/28` parse to the same block.
 */
export interface Cidr {
  network: number;
  prefix: number;
}

const CIDR_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

// `<< 32` is a no-op in JS, so /0 needs its own case.
const prefixMask = (prefix: number): number =>
  prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

/** Parses `a.b.c.d/p`; `null` when malformed or out of range. */
export function parseCidr(value: string): Cidr | null {
  const match = CIDR_REGEX.exec(value);
  if (!match) return null;

  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix > 32) return null;

  const address =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>>
    0;
  return { network: (address & prefixMask(prefix)) >>> 0, prefix };
}

export function formatIPv4(address: number): string {
  return `${(address >>> 24) & 255}.${(address >>> 16) & 255}.${(address >>> 8) & 255}.${address & 255}`;
}

export function formatCidr(cidr: Cidr): string {
  return `${formatIPv4(cidr.network)}/${cidr.prefix}`;
}

/**
 * Two CIDR blocks are either disjoint or one contains the other, so they
 * overlap exactly when they agree on the wider block's prefix.
 */
export function cidrsOverlap(a: Cidr, b: Cidr): boolean {
  const mask = prefixMask(Math.min(a.prefix, b.prefix));
  return (a.network & mask) >>> 0 === (b.network & mask) >>> 0;
}
