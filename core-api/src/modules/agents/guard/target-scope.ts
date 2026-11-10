import { isIP } from 'node:net';

/** A host name or an address/network, as the scope gate compares them. */
export type ScopeTarget =
  | { kind: 'host'; value: string }
  | { kind: 'ip'; value: string; bits: bigint; prefix: number; v6: boolean };

/** One scope line. `block` entries win over any allow entry. */
export interface ScopeEntry {
  block: boolean;
  /** `host`: a name, `*` matches any run of characters (`*.acme.io`) */
  target: ScopeTarget;
}

export type ScopeVerdict = 'allowed' | 'blocked' | 'outside';

function ipBits(addr: string, v6: boolean): bigint {
  if (!v6) {
    return addr.split('.').reduce((n, part) => (n << 8n) | BigInt(part), 0n);
  }
  let text = addr;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4) {
    const n = ipBits(v4[1], false);
    text = `${text.slice(0, v4.index)}${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  return groups.reduce((n, g) => (n << 16n) | BigInt(`0x${g || '0'}`), 0n);
}

/**
 * `acme.io`, `https://user@api.acme.io:8443/x`, `acme.io:443`, `10.0.0.0/24`,
 * `[::1]:80` → the host or network they name; null when it is neither.
 */
export function parseScopeTarget(raw: string): ScopeTarget | null {
  let text = raw.trim().toLowerCase();
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//.exec(text);
  if (scheme) {
    text = text.slice(scheme[0].length).split(/[/?#]/)[0];
    text = text.slice(text.lastIndexOf('@') + 1);
  }
  const [addr, prefix, extra] = text.split('/');
  const v = isIP(addr);
  if (prefix !== undefined && v) {
    const max = v === 6 ? 128 : 32;
    if (extra !== undefined || !/^\d{1,3}$/.test(prefix) || +prefix > max) {
      return null;
    }
    return { kind: 'ip', value: text, bits: ipBits(addr, v === 6), prefix: +prefix, v6: v === 6 };
  }
  let host = addr;
  const bracketed = /^\[([^\]]+)\](:\d+)?$/.exec(host);
  if (bracketed) host = bracketed[1];
  else if (!isIP(host)) host = host.replace(/:\d+$/, '');
  host = host.replace(/\.$/, '');
  const hv = isIP(host);
  if (hv) {
    return { kind: 'ip', value: host, bits: ipBits(host, hv === 6), prefix: hv === 6 ? 128 : 32, v6: hv === 6 };
  }
  return /^[a-z0-9_*-]+(\.[a-z0-9_*-]+)*$/.test(host)
    ? { kind: 'host', value: host }
    : null;
}

const globCache = new Map<string, RegExp>();
/** Whole-string match where `*` is any run of characters. */
export function globMatch(pattern: string, value: string): boolean {
  if (!pattern.includes('*')) return pattern === value;
  let re = globCache.get(pattern);
  if (!re) {
    const body = pattern
      .split('*')
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    re = new RegExp(`^${body}$`);
    globCache.set(pattern, re);
  }
  return re.test(value);
}

/** `entry` holds all of `target`; with `overlap`, any part of it is enough. */
function covers(entry: ScopeTarget, target: ScopeTarget, overlap = false): boolean {
  if (entry.kind === 'host' || target.kind === 'host') {
    return entry.kind === 'host' && target.kind === 'host'
      ? globMatch(entry.value, target.value)
      : false;
  }
  if (entry.v6 !== target.v6) return false;
  if (target.prefix < entry.prefix && !overlap) return false;
  const shift = BigInt((entry.v6 ? 128 : 32) - Math.min(entry.prefix, target.prefix));
  return entry.bits >> shift === target.bits >> shift;
}

/**
 * Where `target` falls: a block entry touching any part of it wins, then an
 * allow entry holding all of it;
 * `known` (exact asset values of the workspace or project) counts as allow.
 * Host names are never resolved: a name is in scope by name only.
 */
export function scopeVerdict(
  target: ScopeTarget,
  entries: ScopeEntry[],
  known: ReadonlySet<string> = new Set(),
): ScopeVerdict {
  if (entries.some((e) => e.block && covers(e.target, target, true))) return 'blocked';
  if (entries.some((e) => !e.block && covers(e.target, target))) return 'allowed';
  return known.has(target.value) ? 'allowed' : 'outside';
}

/**
 * Scope entries for one stored value. A domain covers its subdomains (that is
 * what discovery scans), so `acme.io` also allows `*.acme.io`.
 */
export function entriesFor(value: string, block: boolean, withSubdomains = true): ScopeEntry[] {
  const target = parseScopeTarget(value);
  if (!target) return [];
  const out: ScopeEntry[] = [{ block, target }];
  if (target.kind === 'host' && withSubdomains && !target.value.startsWith('*')) {
    out.push({ block, target: { kind: 'host', value: `*.${target.value}` } });
  }
  return out;
}

/** Tools whose argv names hosts to touch; domains are read only from these. */
const NETWORK_TOOLS = new Set(
  'curl wget nmap masscan naabu rustscan httpx nuclei subfinder amass dnsx dig host nslookup whois ping ping6 traceroute nc ncat netcat telnet ssh scp ftp sqlmap ffuf gobuster dirsearch feroxbuster nikto wpscan whatweb katana gau waybackurls testssl.sh sslscan sslyze openssl hydra medusa nxc crackmapexec smbclient rpcclient ldapsearch snmpwalk enum4linux browser'.split(' '),
);
const NOT_A_TLD =
  /\.(txt|json|xml|csv|ya?ml|log|html?|sh|py|js|ts|md|conf|cfg|ini|out|gz|tgz|tar|zip|lst|list|nse|pcap|pem|key|crt|bin|jar|php|lock|env|db|sql|bak|tmp|png|jpe?g|pdf|toml)$/;
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/;

/**
 * Best effort: the hosts a shell command reaches. URLs and IP literals
 * anywhere; bare domain names only in the arguments of known network tools
 * (so `sys.argv` or `out.json` are not read as hosts). A resolver given as
 * `@8.8.8.8` and loopback addresses are skipped. Misses are expected: this
 * only decides when a command needs a second look.
 */
export function hostsInCommand(command: string): ScopeTarget[] {
  const found = new Map<string, ScopeTarget>();
  const add = (raw: string) => {
    const t = parseScopeTarget(raw);
    if (t && !LOOPBACK.test(t.value)) found.set(t.value, t);
  };
  const rest = command.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`|;&)]+/gi, (url) => {
    add(url);
    return ' ';
  });
  for (const segment of rest.split(/[;&|\n()`]|\$\(/)) {
    const tokens = segment.split(/[\s"'=,]+/).filter(Boolean);
    const networked = tokens.some((t) => NETWORK_TOOLS.has(t.slice(t.lastIndexOf('/') + 1)));
    for (const token of tokens) {
      if (token.startsWith('@') || token.startsWith('-')) continue;
      if (/^\d+\.\d+\.\d+\.\d+(\/\d+|:\d+)?$/.test(token) || (isIP(token) === 6 && token.includes('::'))) {
        add(token);
      } else if (
        networked &&
        /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}\.?(:\d+)?$/i.test(token) &&
        !NOT_A_TLD.test(token.toLowerCase())
      ) {
        add(token);
      }
    }
  }
  return [...found.values()];
}
