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
