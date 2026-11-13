import { BlockList, isIP } from 'node:net';

export function ipType(ip: string): 'ipv4' | 'ipv6' | null {
  const family = isIP(ip);
  return family === 4 ? 'ipv4' : family === 6 ? 'ipv6' : null;
}

/** Address, family and prefix bits of an IP or CIDR entry; null when malformed */
function parseEntry(
  entry: string,
): { address: string; type: 'ipv4' | 'ipv6'; bits?: number } | null {
  const parts = entry.split('/');
  if (parts.length > 2) return null;
  const [address, prefix] = parts;
  const type = ipType(address);
  if (!type) return null;
  if (prefix === undefined) return { address, type };

  const bits = Number(prefix);
  const maxBits = type === 'ipv4' ? 32 : 128;
  if (!/^\d+$/.test(prefix) || bits > maxBits) return null;
  return { address, type, bits };
}

/** Whether `entry` is a single IP address or a CIDR range */
export function isIpOrCidr(entry: string): boolean {
  return parseEntry(entry) !== null;
}

/** Invalid entries are skipped */
export function toBlockList(entries: string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const parsed = parseEntry(entry);
    if (!parsed) continue;
    if (parsed.bits === undefined) {
      list.addAddress(parsed.address, parsed.type);
    } else {
      list.addSubnet(parsed.address, parsed.bits, parsed.type);
    }
  }
  return list;
}

/**
 * Whether `ip` is one of the addresses, or inside one of the CIDR ranges, in
 * `entries`. An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) matches its IPv4
 * entry. A missing or malformed `ip` never matches.
 */
export function isIpInRanges(ip: string | undefined, entries: string[]): boolean {
  if (!ip) return false;
  const type = ipType(ip);
  return type !== null && toBlockList(entries).check(ip, type);
}

/**
 * Ranges that never identify a host on the internet: unspecified, loopback,
 * RFC 1918 private, CGNAT, link-local and IPv6 unique-local.
 */
const NON_PUBLIC_RANGES = toBlockList([
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '::/128',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
]);

/**
 * Whether `ip` is a routable internet address. Local, private and malformed
 * addresses are not; an IPv4-mapped IPv6 address is judged by its IPv4 part.
 */
export function isPublicIp(ip: string | undefined | null): boolean {
  if (!ip) return false;
  const address = unmapIpv4(ip);
  const type = ipType(address);
  return type !== null && !NON_PUBLIC_RANGES.check(address, type);
}

/** `::ffff:a.b.c.d` -> `a.b.c.d`; any other value is returned unchanged. */
export function unmapIpv4(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped ? mapped[1] : ip;
}
