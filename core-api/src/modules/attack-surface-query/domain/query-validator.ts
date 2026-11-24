import { firstMissingPermission } from '@/common/utils/permission-keys.util';
import type { ZodIssue } from 'zod';

import type { Catalog, FieldDef, ResourceDef } from '../catalog/catalog.types';
import { resolvePath, resourcesOf, type ResolvedPath } from '../catalog/paths';
import { AsqError, invalidQuery, type AsqIssue } from './query-errors';
import { limitsFor, type AsqLimits } from './query-limits';
import {
  QueryBatchSchema,
  type FilterInput,
  type IncludeInput,
  type QueryBatchInput,
  type QueryMode,
  type QuerySpecInput,
  type TimeWindowSpec,
} from './query.schema';
import { querySignature } from './query-signature';
import { normalizeHaving } from './having';
import type {
  Bucket,
  HavingNode,
  NormalizedAggregate,
  NormalizedBatch,
  NormalizedGroup,
  NormalizedInclude,
  NormalizedOrder,
  NormalizedQuery,
  NormalizedWindow,
  QueryScope,
} from './query.types';
import { resolveWindow, type ResolvedWindow } from './time-window';
import { normalizeWhere as resolveWhere, relationsOf, topLevelPaths, type WhereNode } from './where';

const MAX_ISSUES = 50;
const SELECT_RULES = { allowMany: false, maxOneHops: 2 };

const MIN_MAX_TYPES = new Set(['int', 'float', 'timestamp', 'text', 'enum']);
const AVG_TYPES = new Set(['int', 'float']);

/** Names of the fields of `res` that pass `keep`, for error messages. */
function fieldsWhere(
  res: ResourceDef,
  keep: (field: FieldDef) => boolean,
  note: (field: FieldDef) => string = () => '',
): string {
  const names = Object.entries(res.fields)
    .filter(([, f]) => keep(f))
    .map(([name, f]) => `${name}${note(f)}`);
  return names.length ? names.join(', ') : 'none';
}

/** Turns zod issues into ASQ issues with a dotted path. */
export function zodIssues(issues: ZodIssue[]): AsqIssue[] {
  return issues.slice(0, MAX_ISSUES).map((issue) => ({
    path: issue.path
      .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`))
      .join(''),
    code: 'INVALID_SHAPE',
    message:
      issue.code === 'unrecognized_keys'
        ? `unknown key(s): ${issue.keys.join(', ')}`
        : issue.message,
  }));
}

/** Parses the raw input with zod; throws INVALID_QUERY with every issue. */
export function parseBatch(input: unknown): QueryBatchInput {
  const parsed = QueryBatchSchema.safeParse(input);
  if (!parsed.success) throw invalidQuery(zodIssues(parsed.error.issues));
  return parsed.data;
}

class IssueBag {
  readonly items: AsqIssue[] = [];
  add(path: string, code: AsqIssue['code'], message: string): void {
    if (this.items.length < MAX_ISSUES) this.items.push({ path, code, message });
  }
}

interface Ctx {
  catalog: Catalog;
  scope: QueryScope;
  limits: AsqLimits;
  now: Date;
  issues: IssueBag;
  resources: Set<string>;
  timezone: string;
}

const TIME_ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

/**
 * Only names the runtime knows reach SQL (as a parameter). `Intl` accepts the
 * IANA aliases too (`Asia/Ho_Chi_Minh`), which `supportedValuesOf` omits.
 */
function isTimeZone(name: string): boolean {
  if (!TIME_ZONE_NAME.test(name)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Validates and resolves a `where` (domain/where.ts), recording what it reads. */
function normalizeWhere(ctx: Ctx, root: ResourceDef, where: FilterInput, at: string): WhereNode | undefined {
  return resolveWhere(
    {
      catalog: ctx.catalog,
      now: ctx.now,
      limits: ctx.limits.filter,
      allowHeavy: ctx.limits.allowHeavy,
      read: (resource) => ctx.resources.add(resource.name),
      issue: (path, code, message) => ctx.issues.add(path, code, message),
    },
    root,
    where,
    at,
  );
}

function resolveSelect(
  ctx: Ctx,
  resource: ResourceDef,
  select: readonly string[] | undefined,
  at: string,
): ResolvedPath[] {
  const explicit = select !== undefined;
  const paths = select ?? resource.defaultSelect;
  if (paths.length > ctx.limits.selectFields) {
    ctx.issues.add(at, 'LIMIT_EXCEEDED', `at most ${ctx.limits.selectFields} fields`);
  }
  const out: ResolvedPath[] = [];
  const seen = new Set<string>();
  for (const [i, path] of paths.entries()) {
    if (seen.has(path)) continue;
    seen.add(path);
    const resolved = resolvePath(ctx.catalog, resource, path, SELECT_RULES);
    if (!resolved.ok) {
      ctx.issues.add(`${at}[${i}]`, resolved.code, resolved.message);
      continue;
    }
    const resources = resourcesOf(resolved.value);
    // A default field the caller may not read is left out instead of failing.
    if (!explicit && resources.some((r) => !r.global && firstMissingPermission(ctx.scope.permissions, [r.permission]) !== null)) {
      continue;
    }
    if (resolved.value.field.heavy && !ctx.limits.allowHeavy) {
      ctx.issues.add(`${at}[${i}]`, 'HEAVY_FIELD_NOT_ALLOWED', `"${path}" is a large field: not available here`);
      continue;
    }
    for (const r of resources) ctx.resources.add(r.name);
    out.push(resolved.value);
  }
  return out;
}

function resolveListOrder(
  ctx: Ctx,
  resource: ResourceDef,
  orderBy: QuerySpecInput['orderBy'],
  at: string,
): NormalizedOrder[] {
  const entries = orderBy ?? resource.defaultOrder;
  const out: NormalizedOrder[] = [];
  for (const [i, { field, dir }] of entries.entries()) {
    const resolved = resolvePath(ctx.catalog, resource, field, SELECT_RULES);
    if (!resolved.ok) {
      ctx.issues.add(`${at}[${i}].field`, resolved.code, resolved.message);
      continue;
    }
    if (!resolved.value.field.sortable) {
      ctx.issues.add(
        `${at}[${i}].field`,
        'NOT_SORTABLE',
        `"${field}" cannot be sorted on (sortable: ${fieldsWhere(resolved.value.owner, (f) => !!f.sortable)})`,
      );
      continue;
    }
    for (const r of resourcesOf(resolved.value)) ctx.resources.add(r.name);
    out.push({ key: field, dir, path: resolved.value });
  }
  return out;
}

function resolveIncludes(
  ctx: Ctx,
  parent: ResourceDef,
  includes: Record<string, IncludeInput> | undefined,
  at: string,
  depth: number,
  counter: { n: number },
): NormalizedInclude[] {
  if (!includes) return [];
  const out: NormalizedInclude[] = [];
  for (const [name, spec] of Object.entries(includes)) {
    const here = `${at}.${name}`;
    counter.n++;
    if (counter.n > ctx.limits.includesPerQuery) {
      ctx.issues.add(here, 'LIMIT_EXCEEDED', `at most ${ctx.limits.includesPerQuery} includes per query`);
      continue;
    }
    if (depth > ctx.limits.includeDepth) {
      ctx.issues.add(here, 'LIMIT_EXCEEDED', `includes nest at most ${ctx.limits.includeDepth} levels`);
      continue;
    }
    const def = Object.prototype.hasOwnProperty.call(parent.many, name) ? parent.many[name] : undefined;
    if (!def) {
      const isOne = name in parent.one;
      ctx.issues.add(
        here,
        'UNKNOWN_RELATION',
        isOne
          ? `"${name}" is a single related row: select its fields with "${name}.<field>" instead`
          : `${parent.name} has no list relation "${name}" (lists: ${Object.keys(parent.many).join(', ') || 'none'})`,
      );
      continue;
    }
    const child = ctx.catalog[def.resource];
    ctx.resources.add(child.name);
    const limit = spec.limit ?? ctx.limits.defaultIncludeLimit;
    if (limit > ctx.limits.maxIncludeLimit) {
      ctx.issues.add(`${here}.limit`, 'LIMIT_EXCEEDED', `include limit must be at most ${ctx.limits.maxIncludeLimit}`);
    }
    const orderBy: NormalizedOrder[] = [];
    for (const [i, { field, dir }] of (spec.orderBy ?? []).entries()) {
      if (!def.indexedOrder.includes(field)) {
        ctx.issues.add(
          `${here}.orderBy[${i}].field`,
          'NOT_SORTABLE',
          `${name} can be ordered by ${def.indexedOrder.join(', ') || 'nothing (natural order)'}`,
        );
        continue;
      }
      const resolved = resolvePath(ctx.catalog, child, field, SELECT_RULES);
      if (resolved.ok) orderBy.push({ key: field, dir, path: resolved.value });
    }
    if (orderBy.length === 0 && def.indexedOrder.length > 0 && !spec.orderBy) {
      const field = def.indexedOrder[0];
      const resolved = resolvePath(ctx.catalog, child, field, SELECT_RULES);
      if (resolved.ok) orderBy.push({ key: field, dir: 'desc', path: resolved.value });
    }
    const where = spec.where ? normalizeWhere(ctx, child, spec.where, `${here}.where`) : undefined;
    if (where && (relationsOf(where).length > 0 || topLevelPaths(where).some((p) => p.hops.some((h) => h.kind === 'many')))) {
      ctx.issues.add(`${here}.where`, 'UNKNOWN_RELATION', 'an include filter cannot test a nested list');
    }
    out.push({
      name,
      def,
      resource: child,
      select: resolveSelect(ctx, child, spec.select, `${here}.select`),
      where,
      orderBy,
      limit: Math.min(limit, ctx.limits.maxIncludeLimit),
      include: resolveIncludes(ctx, child, spec.include, `${here}.include`, depth + 1, counter),
    });
  }
  return out;
}

function resolveWindowFor(
  ctx: Ctx,
  resource: ResourceDef,
  spec: QuerySpecInput,
  batchWindow: ResolvedWindow | undefined,
  at: string,
): NormalizedWindow | undefined {
  let window: ResolvedWindow | undefined;
  if (spec.window === null) return undefined;
  if (spec.window) {
    const resolved = resolveWindow(spec.window, ctx.now);
    if (!resolved.ok) {
      ctx.issues.add(`${at}.window`, 'INVALID_TIME', resolved.message);
      return undefined;
    }
    window = resolved.value;
  } else {
    window = batchWindow;
  }
  if (!window) return undefined;
  const fieldPath = spec.windowField ?? resource.defaultTimeField;
  if (!fieldPath) {
    ctx.issues.add(`${at}.window`, 'INVALID_TIME', `${resource.name} has no time field: set windowField or window: null`);
    return undefined;
  }
  const resolved = resolvePath(ctx.catalog, resource, fieldPath, SELECT_RULES);
  if (!resolved.ok) {
    ctx.issues.add(`${at}.windowField`, resolved.code, resolved.message);
    return undefined;
  }
  if (resolved.value.field.type !== 'timestamp') {
    ctx.issues.add(`${at}.windowField`, 'INVALID_TIME', `"${fieldPath}" is not a time field`);
    return undefined;
  }
  for (const r of resourcesOf(resolved.value)) ctx.resources.add(r.name);
  return { path: resolved.value, since: window.since, until: window.until };
}

function normalizeAggregate(
  ctx: Ctx,
  resource: ResourceDef,
  spec: QuerySpecInput,
  at: string,
): { groupBy: NormalizedGroup[]; aggregate: NormalizedAggregate[]; having?: HavingNode; orderBy: NormalizedOrder[] } {
  const groupBy: NormalizedGroup[] = [];
  for (const [i, g] of (spec.groupBy ?? []).entries()) {
    const field = typeof g === 'string' ? g : g.field;
    const bucket = typeof g === 'string' ? undefined : g.bucket;
    const resolved = resolvePath(ctx.catalog, resource, field, SELECT_RULES);
    if (!resolved.ok) {
      ctx.issues.add(`${at}.groupBy[${i}]`, resolved.code, resolved.message);
      continue;
    }
    const f = resolved.value.field;
    if (!f.groupable) {
      ctx.issues.add(
        `${at}.groupBy[${i}]`,
        'NOT_GROUPABLE',
        `"${field}" cannot be grouped by (groupable: ${fieldsWhere(
          resolved.value.owner,
          (g) => !!g.groupable,
          (g) => (g.type === 'timestamp' ? ' (with a bucket)' : ''),
        )})`,
      );
      continue;
    }
    if (f.type === 'timestamp' && !bucket) {
      ctx.issues.add(`${at}.groupBy[${i}]`, 'NOT_GROUPABLE', `"${field}" is a time: group it with { "field": "${field}", "bucket": "day" }`);
      continue;
    }
    if (bucket && f.type !== 'timestamp') {
      ctx.issues.add(`${at}.groupBy[${i}]`, 'NOT_GROUPABLE', `bucket only applies to time fields`);
      continue;
    }
    for (const r of resourcesOf(resolved.value)) ctx.resources.add(r.name);
    groupBy.push({ key: field, path: resolved.value, bucket });
  }
  if (groupBy.length > ctx.limits.groupBy) {
    ctx.issues.add(`${at}.groupBy`, 'LIMIT_EXCEEDED', `at most ${ctx.limits.groupBy} groups`);
  }

  const aggregate: NormalizedAggregate[] = [];
  const entries = Object.entries(spec.aggregate ?? {});
  if (entries.length > ctx.limits.aggregates) {
    ctx.issues.add(`${at}.aggregate`, 'LIMIT_EXCEEDED', `at most ${ctx.limits.aggregates} aggregates`);
  }
  for (const [alias, { fn, field, where: filter }] of entries) {
    const here = `${at}.aggregate.${alias}`;
    if (groupBy.some((g) => g.key === alias)) {
      ctx.issues.add(here, 'MODE_CONFLICT', `"${alias}" is also a group key`);
      continue;
    }
    const where = filter ? normalizeWhere(ctx, resource, filter, `${here}.where`) : undefined;
    if (!field) {
      if (fn !== 'count') ctx.issues.add(here, 'INVALID_SHAPE', `${fn} needs a field`);
      else aggregate.push({ alias, fn, where });
      continue;
    }
    const resolved = resolvePath(ctx.catalog, resource, field, SELECT_RULES);
    if (!resolved.ok) {
      ctx.issues.add(`${here}.field`, resolved.code, resolved.message);
      continue;
    }
    const type = resolved.value.field.type;
    if (type === 'json' || resolved.value.field.heavy) {
      ctx.issues.add(`${here}.field`, 'NOT_GROUPABLE', `"${field}" cannot be aggregated`);
      continue;
    }
    if ((fn === 'min' || fn === 'max') && !MIN_MAX_TYPES.has(type)) {
      ctx.issues.add(`${here}.field`, 'NOT_GROUPABLE', `${fn} needs a number, time or text field`);
      continue;
    }
    if ((fn === 'avg' || fn === 'sum') && !AVG_TYPES.has(type)) {
      ctx.issues.add(`${here}.field`, 'NOT_GROUPABLE', `${fn} needs a number field`);
      continue;
    }
    for (const r of resourcesOf(resolved.value)) ctx.resources.add(r.name);
    aggregate.push({ alias, fn, path: resolved.value, where });
  }

  const having = spec.having
    ? normalizeHaving(
        {
          now: ctx.now,
          limits: ctx.limits.filter,
          groupBy,
          aggregate,
          issue: (path, code, message) => ctx.issues.add(path, code, message),
        },
        spec.having,
        `${at}.having`,
      )
    : undefined;

  const orderBy: NormalizedOrder[] = [];
  for (const [i, { field, dir }] of (spec.orderBy ?? []).entries()) {
    const group = groupBy.find((g) => g.key === field);
    if (group) {
      orderBy.push({ key: field, dir, path: group.path, bucket: group.bucket });
      continue;
    }
    if (aggregate.some((a) => a.alias === field)) {
      orderBy.push({ key: field, dir, alias: field });
      continue;
    }
    ctx.issues.add(`${at}.orderBy[${i}].field`, 'NOT_SORTABLE', `in an aggregate query, order by a group key or an aggregate name`);
  }
  if (orderBy.length === 0 && !spec.orderBy) {
    // A filled series reads in time order; other counts biggest first.
    if (spec.fill && groupBy.length) orderBy.push({ key: groupBy[0].key, dir: 'asc', path: groupBy[0].path, bucket: groupBy[0].bucket });
    else if (aggregate.length) orderBy.push({ key: aggregate[0].alias, dir: 'desc', alias: aggregate[0].alias });
  }
  return { groupBy, aggregate, having, orderBy };
}

const BUCKET_MS: Record<Bucket, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  // A month is at least 28 days: the bound may overcount, never under.
  month: 28 * 86_400_000,
};

/** Points of a filled series over `window`, or an issue. */
function fillPoints(ctx: Ctx, groupBy: NormalizedGroup[], window: NormalizedWindow | undefined, at: string): number | undefined {
  if (groupBy.length !== 1 || !groupBy[0].bucket) {
    ctx.issues.add(`${at}.fill`, 'MODE_CONFLICT', 'fill needs exactly one groupBy on a time with a bucket');
    return undefined;
  }
  if (!window) {
    ctx.issues.add(`${at}.fill`, 'MODE_CONFLICT', 'fill needs a window: the series spans it');
    return undefined;
  }
  return Math.floor((window.until.getTime() - window.since.getTime()) / BUCKET_MS[groupBy[0].bucket]) + 2;
}

function normalizeQuery(
  ctx: Ctx,
  name: string,
  spec: QuerySpecInput,
  batchWindow: ResolvedWindow | undefined,
  batchWindowInput: TimeWindowSpec | undefined,
  mode: QueryMode,
): NormalizedQuery | undefined {
  const at = `queries.${name}`;
  const resource = Object.prototype.hasOwnProperty.call(ctx.catalog, spec.from) ? ctx.catalog[spec.from] : undefined;
  if (!resource || !resource.root || resource.global) {
    const roots = Object.values(ctx.catalog).filter((r) => r.root).map((r) => r.name);
    ctx.issues.add(`${at}.from`, 'UNKNOWN_RESOURCE', `"${spec.from}" is not queryable (resources: ${roots.join(', ')})`);
    return undefined;
  }
  if (ctx.scope.projectId && resource.projectScope === null) {
    ctx.issues.add(`${at}.from`, 'UNKNOWN_RESOURCE', `${resource.name} is workspace-wide and cannot be read in a project scope`);
    return undefined;
  }
  ctx.resources.add(resource.name);

  const isAggregate = spec.aggregate !== undefined;
  if (!isAggregate) {
    for (const key of ['groupBy', 'having', 'fill'] as const) {
      if (spec[key] !== undefined) ctx.issues.add(`${at}.${key}`, 'MODE_CONFLICT', `${key} needs aggregate`);
    }
  }
  if (isAggregate) {
    for (const key of ['select', 'include', 'cursor', 'withTotal'] as const) {
      if (spec[key] !== undefined) ctx.issues.add(`${at}.${key}`, 'MODE_CONFLICT', `${key} cannot be used with aggregate`);
    }
    if (Object.keys(spec.aggregate ?? {}).length === 0) {
      ctx.issues.add(`${at}.aggregate`, 'INVALID_SHAPE', 'aggregate must name at least one value');
    }
  }

  const limit = spec.limit ?? ctx.limits.defaultLimit;
  if (limit > ctx.limits.maxLimit) {
    ctx.issues.add(`${at}.limit`, 'LIMIT_EXCEEDED', `limit must be at most ${ctx.limits.maxLimit}${mode === 'interactive' && ctx.scope.caller === 'http' ? ' (use options.mode "report" for more)' : ''}`);
  }
  if ((spec.orderBy?.length ?? 0) > ctx.limits.orderBy) {
    ctx.issues.add(`${at}.orderBy`, 'LIMIT_EXCEEDED', `at most ${ctx.limits.orderBy} sort keys`);
  }

  const where = spec.where ? normalizeWhere(ctx, resource, spec.where, `${at}.where`) : undefined;
  const window = resolveWindowFor(ctx, resource, spec, batchWindow, at);
  // A query inheriting the batch window is bound to that window too.
  const signature = querySignature({
    ...spec,
    batchWindow: spec.window === undefined ? batchWindowInput : undefined,
  });

  if (isAggregate) {
    const { groupBy, aggregate, having, orderBy } = normalizeAggregate(ctx, resource, spec, at);
    let rows = Math.min(limit, ctx.limits.maxLimit);
    if (spec.fill) {
      const points = fillPoints(ctx, groupBy, window, at);
      if (points !== undefined && points > ctx.limits.maxLimit) {
        ctx.issues.add(`${at}.fill`, 'LIMIT_EXCEEDED', `the series has up to ${points} buckets (at most ${ctx.limits.maxLimit}): use a larger bucket or a shorter window`);
      }
      // A filled series returns every bucket unless a limit is set.
      if (points !== undefined && spec.limit === undefined) rows = Math.min(points, ctx.limits.maxLimit);
    }
    return {
      name,
      resource,
      mode: 'aggregate',
      select: [],
      include: [],
      where,
      window,
      groupBy,
      aggregate,
      having,
      fill: spec.fill ?? false,
      timezone: ctx.timezone,
      orderBy,
      limit: rows,
      withTotal: false,
      signature,
    };
  }

  return {
    name,
    resource,
    mode: 'list',
    select: resolveSelect(ctx, resource, spec.select, `${at}.select`),
    include: resolveIncludes(ctx, resource, spec.include, `${at}.include`, 1, { n: 0 }),
    where,
    window,
    groupBy: [],
    aggregate: [],
    fill: false,
    timezone: ctx.timezone,
    orderBy: resolveListOrder(ctx, resource, spec.orderBy, `${at}.orderBy`),
    limit: Math.min(limit, ctx.limits.maxLimit),
    cursor: spec.cursor,
    withTotal: spec.withTotal ?? false,
    signature,
  };
}

/**
 * Validates a parsed batch against the catalog and the caller: every path,
 * operator, value, limit and permission. Collects every issue before
 * throwing, so one round trip shows them all (the agent fixes its query from
 * this list). Permission gaps throw PERMISSION_DENIED for the whole batch.
 */
export function validateBatch(
  catalog: Catalog,
  input: QueryBatchInput,
  scope: QueryScope,
  now: Date,
): NormalizedBatch {
  const mode: QueryMode = input.options?.mode ?? 'interactive';
  const issues = new IssueBag();
  if (mode === 'report' && scope.caller !== 'http') {
    issues.add('options.mode', 'MODE_CONFLICT', 'report mode is only available through the HTTP API');
  }
  const limits = limitsFor(scope.caller, mode);
  const timezone = input.options?.timezone ?? 'UTC';
  if (!isTimeZone(timezone)) {
    issues.add('options.timezone', 'INVALID_VALUE', `"${timezone}" is not an IANA time zone (e.g. "UTC", "Asia/Ho_Chi_Minh")`);
  }
  const ctx: Ctx = { catalog, scope, limits, now, issues, resources: new Set(), timezone };

  const names = Object.keys(input.queries);
  if (names.length > limits.queriesPerBatch) {
    issues.add('queries', 'LIMIT_EXCEEDED', `at most ${limits.queriesPerBatch} queries per request`);
  }

  let batchWindow: ResolvedWindow | undefined;
  if (input.window) {
    const resolved = resolveWindow(input.window, now);
    if (resolved.ok) batchWindow = resolved.value;
    else issues.add('window', 'INVALID_TIME', resolved.message);
  }

  const queries: NormalizedQuery[] = [];
  for (const name of names) {
    const normalized = normalizeQuery(ctx, name, input.queries[name], batchWindow, input.window, mode);
    if (normalized) queries.push(normalized);
  }
  if (issues.items.length > 0) throw invalidQuery(issues.items);

  const required = [...ctx.resources]
    .map((name) => catalog[name])
    .filter((r) => !r.global)
    .map((r) => r.permission);
  const missing = firstMissingPermission(scope.permissions, [...new Set(required)]);
  if (missing) {
    throw new AsqError('PERMISSION_DENIED', `Missing permission ${missing} for this query`);
  }

  return {
    now,
    queries,
    consistent: input.options?.consistent ?? false,
    mode,
    resources: ctx.resources,
  };
}
