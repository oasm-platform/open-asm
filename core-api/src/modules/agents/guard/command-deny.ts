/** A built-in rule that matched: why the platform refuses the call. */
export interface PolicyHit {
  ruleId: string;
  reason: string;
}

/**
 * Shell text the rules read: line continuations joined, quotes and escapes
 * dropped (so `r"m" -rf '/'` reads as `rm -rf /`) and `bash -c '…'` bodies
 * flattened into the outer command.
 */
export function normalizeCommand(text: string): string {
  return text.replace(/\\\r?\n/g, ' ').replace(/["'\\]/g, '');
}

/** Simple commands split on control operators, each as whitespace tokens. */
function segmentsOf(normalized: string): string[][] {
  return normalized
    .split(/[;&|\n()`]|\$\(/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean))
    .filter((s) => s.length > 0);
}

const base = (token: string) => token.slice(token.lastIndexOf('/') + 1);

/** Arguments after each occurrence of `name` as a command word (sudo, xargs, bash -c …). */
function argsAfter(
  segments: string[][],
  names: (cmd: string) => boolean,
): string[][] {
  const found: string[][] = [];
  for (const tokens of segments) {
    tokens.forEach((t, i) => {
      if (names(base(t))) found.push(tokens.slice(i + 1));
    });
  }
  return found;
}

const SYSTEM_DIRS =
  /^\/(bin|boot|dev|etc|home|lib|lib32|lib64|opt|proc|root|run|sbin|srv|sys|usr|var)$/;

/** `/`, `/*`, `~`, `$HOME` and the top-level system directories. */
function isProtectedPath(path: string): boolean {
  let p = path.replace(/\/{2,}/g, '/');
  p = p.replace(/\/(\*|\.)?$/, '');
  if (p === '' || p === '*' || p === '~' || p === '$HOME' || p === '${HOME}') {
    return true;
  }
  return SYSTEM_DIRS.test(p);
}

interface BuiltinRule {
  id: string;
  reason: string;
  matches: (normalized: string, segments: string[][], raw: string) => boolean;
}

const BUILTIN_RULES: BuiltinRule[] = [
  {
    id: 'recursive-delete-root',
    reason: 'recursive delete of the root, home or a system directory',
    matches: (_n, segments) =>
      argsAfter(segments, (c) => c === 'rm').some(
        (args) =>
          args.includes('--no-preserve-root') ||
          (args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive') &&
            args.some((a) => !a.startsWith('-') && isProtectedPath(a))),
      ),
  },
  {
    id: 'format-disk',
    reason: 'formatting or wiping a filesystem',
    matches: (_n, segments) =>
      argsAfter(segments, (c) => /^(mkfs(\..+)?|mke2fs|mkswap|wipefs)$/.test(c))
        .length > 0,
  },
  {
    id: 'raw-device-write',
    reason: 'writing raw data to a block device',
    matches: (n, segments) =>
      argsAfter(segments, (c) => c === 'dd').some((args) =>
        args.some((a) =>
          /^of=\/dev\/(?!null$|zero$|stdout$|stderr$|fd\/)/.test(a),
        ),
      ) ||
      />\s*\/dev\/(sd[a-z]|nvme\d|hd[a-z]|vd[a-z]|xvd[a-z]|mmcblk\d|disk\d|mapper\/)/.test(
        n,
      ),
  },
  {
    id: 'fork-bomb',
    reason: 'a fork bomb',
    matches: (_n, _s, raw) =>
      /(\S+?)\s*\(\)\s*\{[^}]*?\1\s*\|\s*\1\s*&/.test(raw),
  },
  {
    id: 'host-shutdown',
    reason: 'shutting down or rebooting the worker host',
    matches: (_n, segments) =>
      argsAfter(segments, (c) => /^(shutdown|reboot|halt|poweroff)$/.test(c))
        .length > 0 ||
      argsAfter(segments, (c) => c === 'systemctl').some((a) =>
        /^(poweroff|reboot|halt)$/.test(a[0] ?? ''),
      ) ||
      argsAfter(segments, (c) => c === 'init').some((a) => /^[06]$/.test(a[0] ?? '')),
  },
  {
    id: 'destructive-sql',
    reason: 'a destructive SQL statement (DROP, TRUNCATE or DELETE without WHERE)',
    matches: (n) =>
      /\bdrop\s+(table|database|schema)\b/i.test(n) ||
      /\btruncate\s+(table\s+)?[a-z_]/i.test(n) ||
      /\bdelete\s+from\s+[\w.]+\b(?!\s*\.)(?!\s+(where|using)\b)/i.test(n),
  },
  {
    id: 'redis-flush',
    reason: 'flushing a Redis database',
    matches: (n) => /\bflush(all|db)\b/i.test(n),
  },
  {
    id: 'http-delete',
    reason: 'an HTTP DELETE request',
    matches: (n, segments) =>
      argsAfter(segments, (c) => c === 'curl' || c === 'wget').some((args) =>
        args.some(
          (a, i) =>
            /^(-[a-zA-Z]*X|--request|--method)=?DELETE$/i.test(a) ||
            (/^(-[a-zA-Z]*X|--request|--method)$/.test(a) &&
              /^DELETE$/i.test(args[i + 1] ?? '')),
        ),
      ) ||
      argsAfter(segments, (c) => /^(http|https|xh)$/.test(c)).some(
        (args) => /^DELETE$/i.test(args.find((a) => !a.startsWith('-')) ?? ''),
      ) ||
      /\b(requests|httpx|session|client)\s*\.\s*delete\s*\(/i.test(n) ||
      /\bmethod\s*[:=]\s*DELETE\b/i.test(n),
  },
];

/** The first built-in rule `text` breaks, or null. Checked in every approval mode. */
export function matchBuiltinDeny(text: string): PolicyHit | null {
  const normalized = normalizeCommand(text);
  const segments = segmentsOf(normalized);
  const rule = BUILTIN_RULES.find((r) => r.matches(normalized, segments, text));
  return rule ? { ruleId: `builtin:${rule.id}`, reason: rule.reason } : null;
}
