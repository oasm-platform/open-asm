import { ProjectScopeRuleMode, ProjectScopeRuleType } from '@/common/enums/enum';
import { isUUID } from 'class-validator';
import { isIP } from 'net';

/** The part of a scope rule that decides what it matches. */
export interface ScopeRuleLike {
  id?: string;
  mode: ProjectScopeRuleMode;
  type: ProjectScopeRuleType;
  value: string;
}

/**
 * Positional parameters for a raw query (`$1`, `$2`, …). The rule SQL below is
 * spliced into several statements (preview, sync, discovery), each with its
 * own leading parameters, so values are appended rather than numbered up
 * front.
 */
export class SqlParams {
  readonly values: unknown[] = [];

  constructor(initial: unknown[] = []) {
    this.values.push(...initial);
  }

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

const HOSTNAME_RE = /^[a-z0-9*_.-]+$/;

/**
 * Validates a rule value for its type and returns the stored form, or throws
 * an Error whose message is safe to show (the service turns it into a 400).
 *
 * - target, asset: a UUID.
 * - hostname: letters, digits, `-`, `_`, `.` and `*` wildcards; lowercased.
 *   A bare `*` would match every hostname in the workspace and is refused.
 * - cidr: an IPv4/IPv6 network; a single address becomes /32 or /128.
 */
export function normalizeScopeRuleValue(
  type: ProjectScopeRuleType,
  value: string,
): string {
  const raw = (value ?? '').trim();
  switch (type) {
    case ProjectScopeRuleType.TARGET:
    case ProjectScopeRuleType.ASSET:
      if (!isUUID(raw)) throw new Error(`"${raw}" is not a valid ${type} id`);
      return raw.toLowerCase();
    case ProjectScopeRuleType.HOSTNAME: {
      const host = raw.toLowerCase();
      if (!host || !HOSTNAME_RE.test(host) || /^[*.]+$/.test(host)) {
        throw new Error(`"${raw}" is not a valid hostname pattern`);
      }
      return host;
    }
    case ProjectScopeRuleType.CIDR: {
      const [addr, prefix, extra] = raw.split('/');
      const version = isIP(addr);
      const max = version === 4 ? 32 : version === 6 ? 128 : 0;
      if (!max || extra !== undefined || addr.includes('%')) {
        throw new Error(`"${raw}" is not a valid CIDR`);
      }
      if (prefix === undefined) return `${addr}/${max}`;
      if (!/^\d{1,3}$/.test(prefix) || Number(prefix) > max) {
        throw new Error(`"${raw}" is not a valid CIDR`);
      }
      return `${addr}/${Number(prefix)}`;
    }
    default:
      throw new Error(`Unknown scope rule type "${String(type)}"`);
  }
}

/** `*.acme.io` → `%.acme.io` for ILIKE, with `%`, `_` and `\` escaped. */
export function hostnamePatternToLike(pattern: string): string {
  return pattern.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '%');
}

/**
 * Boolean SQL over the alias `a` (an `assets` row) that is true when the asset
 * matches the rule. A CIDR matches the asset's own value when it is an IP
 * (CIDR and IP targets) or any address observed for it (DNS A/AAAA, HTTP
 * probe). The cast sits behind a CASE because AND does not short-circuit in
 * SQL, and a hostname is not an `inet`.
 */
export function scopeRuleMatchSql(rule: ScopeRuleLike, params: SqlParams): string {
  switch (rule.type) {
    case ProjectScopeRuleType.TARGET:
      return `a."targetId" = ${params.add(rule.value)}`;
    case ProjectScopeRuleType.ASSET:
      return `a.id = CAST(${params.add(rule.value)} AS uuid)`;
    case ProjectScopeRuleType.HOSTNAME:
      return `a.value ILIKE ${params.add(hostnamePatternToLike(rule.value))} ESCAPE '\\'`;
    case ProjectScopeRuleType.CIDR: {
      const cidr = params.add(rule.value);
      return `(CASE WHEN pg_input_is_valid(a.value, 'inet') THEN CAST(a.value AS inet) <<= CAST(${cidr} AS inet) ELSE false END OR EXISTS (SELECT 1 FROM ip_observations io WHERE io."assetId" = a.id AND io.ip <<= CAST(${cidr} AS inet)))`;
    }
    default:
      return 'false';
  }
}

/**
 * The rule set as one condition plus, on demand, the first include rule that
 * matched each asset (which `project_assets.scopeRuleId` records). `null`
 * when there is no include rule: excludes alone select nothing.
 *
 * `ruleIdSql` adds its parameters only when called: Postgres refuses a bound
 * parameter the statement never uses, so a query that only filters must not
 * carry the rule ids.
 */
export function scopeRulesSql(
  rules: ScopeRuleLike[],
  params: SqlParams,
): { where: string; ruleIdSql: () => string } | null {
  const includes = rules.filter((r) => r.mode === ProjectScopeRuleMode.INCLUDE);
  const excludes = rules.filter((r) => r.mode === ProjectScopeRuleMode.EXCLUDE);
  if (includes.length === 0) return null;

  const includeSql = includes.map((rule) => scopeRuleMatchSql(rule, params));
  let where = `(${includeSql.join(' OR ')})`;
  if (excludes.length > 0) {
    where += ` AND NOT (${excludes
      .map((rule) => scopeRuleMatchSql(rule, params))
      .join(' OR ')})`;
  }
  const ruleIdSql = () =>
    `CASE ${includes
      .map(
        (rule, i) =>
          `WHEN ${includeSql[i]} THEN CAST(${params.add(rule.id ?? null)} AS uuid)`,
      )
      .join(' ')} END`;
  return { where, ruleIdSql };
}
