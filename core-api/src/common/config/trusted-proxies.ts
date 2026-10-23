import { BlockList, isIP } from 'node:net';

/**
 * Parses TRUSTED_PROXIES: comma-separated IPs or CIDR ranges of the reverse
 * proxies in front of core-api (nginx, Cloudflare Tunnel, a load balancer).
 * Empty => no proxy is trusted and X-Forwarded-For is not walked.
 */
export function parseTrustedProxies(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function ipType(ip: string): 'ipv4' | 'ipv6' | null {
  const family = isIP(ip);
  return family === 4 ? 'ipv4' : family === 6 ? 'ipv6' : null;
}

/** Invalid entries are skipped; Better Auth already warns about them at boot. */
function toBlockList(trustedProxies: string[]): BlockList {
  const list = new BlockList();
  for (const entry of trustedProxies) {
    const [address, prefix] = entry.split('/');
    const type = ipType(address);
    if (!type) continue;
    if (prefix === undefined) {
      list.addAddress(address, type);
      continue;
    }
    const bits = Number(prefix);
    const maxBits = type === 'ipv4' ? 32 : 128;
    if (/^\d+$/.test(prefix) && bits <= maxBits) {
      list.addSubnet(address, bits, type);
    }
  }
  return list;
}

/**
 * Client IP of a connection that may arrive through trusted reverse proxies.
 * X-Forwarded-For is only honoured when the direct peer is itself trusted,
 * and is read right to left (each proxy appends the address it saw), so a
 * value the client forged on the left is never picked.
 */
export function resolveClientIp(
  peerIp: string | undefined,
  forwardedFor: string | undefined,
  trustedProxies: string[],
): string | undefined {
  if (!peerIp || !forwardedFor || trustedProxies.length === 0) return peerIp;
  const trusted = toBlockList(trustedProxies);
  const isTrusted = (ip: string) => {
    const type = ipType(ip);
    return type !== null && trusted.check(ip, type);
  };
  if (!isTrusted(peerIp)) return peerIp;

  const hops = forwardedFor
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);
  for (let i = hops.length - 1; i >= 0; i--) {
    // A malformed hop means the chain cannot be trusted past this point.
    if (!ipType(hops[i])) return peerIp;
    if (!isTrusted(hops[i])) return hops[i];
  }
  return peerIp;
}
