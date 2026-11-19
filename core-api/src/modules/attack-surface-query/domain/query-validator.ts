import {
  validateFilter,
  type FilterCondition,
  type FilterFieldSpec,
  type FilterGroup,
  type FilterSchema,
  type FilterTree,
} from '@/common/utils/filter-tree';
import { firstMissingPermission } from '@/common/utils/permission-keys.util';
import type { ZodIssue } from 'zod';

import { checkFieldValue, fieldOps } from '../catalog/catalog';
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
import type {
  NormalizedAggregate,
  NormalizedBatch,
  NormalizedGroup,
  NormalizedInclude,
  NormalizedOrder,
  NormalizedQuery,
  NormalizedWindow,
  QueryScope,
} from './query.types';
import { parseTimeExpr, resolveWindow, type ResolvedWindow } from './time-window';

const MAX_ISSUES = 50;
const SELECT_RULES = { allowMany: false, maxOneHops: 2 };
const WHERE_RULES = { allowMany: true, maxOneHops: 3 };

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

type Condition = FilterCondition<string>;

function conditionsOf(tree: FilterInput): unknown[] {
  return tree.items.flatMap((item) =>
    typeof item === 'object' && item !== null && 'conditions' in item && Array.isArray((item as FilterGroup).conditions)
      ? (item as FilterGroup).conditions
      : [item],
  );
}

interface Ctx {
  catalog: Catalog;
  scope: QueryScope;
  limits: AsqLimits;
  now: Date;
  issues: IssueBag;
  resources: Set<string>;
}

/**
 * Resolves the paths of a `where` tree, turns timestamp values (`now-5d`) into
 * ISO strings, and runs the shared filter-tree validator over a schema built
 * from the catalog (operators and value checks per field).
 */
function normalizeWhere(
  ctx: Ctx,
  root: ResourceDef,
  where: FilterInput,
  at: string,
): { tree?: FilterTree; paths: Map<string, ResolvedPath> } {
  const paths = new Map<string, ResolvedPath>();
  let broken = false;
  for (const raw of conditionsOf(where)) {
    if (typeof raw !== 'object' || raw === null) continue; // validateFilter reports it
    const field = (raw as { field?: unknown }).field;
    if (typeof field !== 'string' || paths.has(field)) continue;
    const resolved = resolvePath(ctx.catalog, root, field, WHERE_RULES);
    if (!resolved.ok) {
      ctx.issues.add(`${at}.field "${field}"`, resolved.code, resolved.message);
      broken = true;
      continue;
    }
    if (resolved.value.field.heavy && !ctx.limits.allowHeavy) {
      ctx.issues.add(at, 'HEAVY_FIELD_NOT_ALLOWED', `"${field}" is a large field and cannot be filtered here`);
      broken = true;
    }
    if (resolved.value.field.type === 'json') {
      ctx.issues.add(at, 'OP_NOT_ALLOWED', `"${field}" cannot be filtered`);
      broken = true;
    }
    paths.set(field, resolved.value);
    for (const r of resourcesOf(resolved.value)) ctx.resources.add(r.name);
  }
  if (broken) return { paths };

  // Resolve time expressions in place, on a copy.
  const resolveValue = (path: ResolvedPath, value: unknown): unknown => {
    if (path.field.type !== 'timestamp' || typeof value !== 'string') return value;
    const parsed = parseTimeExpr(value, ctx.now, { allowFuture: true });
    if (!parsed.ok) {
      ctx.issues.add(at, 'INVALID_TIME', `${path.path}: ${parsed.message}`);
      broken = true;
      return value;
    }
    return parsed.value.toISOString();
  };
  const copyCondition = (raw: unknown): unknown => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const c = raw as Condition;
    const path = paths.get(c.field);
    if (!path) return raw;
    return {
      ...c,
      value: Array.isArray(c.value) ? c.value.map((v) => resolveValue(path, v)) : resolveValue(path, c.value),
    };
  };
  const tree = {
    logic: where.logic,
    items: where.items.map((item) =>
      typeof item === 'object' && item !== null && 'conditions' in item
        ? { ...(item as FilterGroup), conditions: (item as FilterGroup).conditions.map(copyCondition) }
        : copyCondition(item),
    ),
  };
  if (broken) return { paths };

  const schema: FilterSchema<string> = {};
  for (const [name, path] of paths) {
    const spec: FilterFieldSpec = {
      ops: fieldOps(path.field),
      check: (v, op) => checkFieldValue(path.field, v, op),
      any: () => '',
      like: () => '',
      subnet: () => '',
      cmp: () => '',
    };
    schema[name] = spec;
  }
  const error = validateFilter(schema, tree);
  if (error) {
    ctx.issues.add(at, error.includes('is not allowed') ? 'OP_NOT_ALLOWED' : 'INVALID_VALUE', error);
    return { paths };
  }
  return { tree: tree as FilterTree, paths };
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
    if (where && [...where.paths.values()].some((p) => p.hops.some((h) => h.kind === 'many'))) {
      ctx.issues.add(`${here}.where`, 'UNKNOWN_RELATION', 'an include filter cannot test a nested list');
    }
    out.push({
      name,
      def,
      resource: child,
      select: resolveSelect(ctx, child, spec.select, `${here}.select`),
      where: where?.tree,
      wherePaths: where?.paths ?? new Map(),
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
): { groupBy: NormalizedGroup[]; aggregate: NormalizedAggregate[]; orderBy: NormalizedOrder[] } {
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
  for (const [alias, { fn, field }] of entries) {
    const here = `${at}.aggregate.${alias}`;
    if (groupBy.some((g) => g.key === alias)) {
      ctx.issues.add(here, 'MODE_CONFLICT', `"${alias}" is also a group key`);
      continue;
    }
    if (!field) {
      if (fn !== 'count') ctx.issues.add(here, 'INVALID_SHAPE', `${fn} needs a field`);
      else aggregate.push({ alias, fn });
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
    if (fn === 'avg' && !AVG_TYPES.has(type)) {
      ctx.issues.add(`${here}.field`, 'NOT_GROUPABLE', 'avg needs a number field');
      continue;
    }
    for (const r of resourcesOf(resolved.value)) ctx.resources.add(r.name);
    aggregate.push({ alias, fn, path: resolved.value });
  }

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
    if (aggregate.length) orderBy.push({ key: aggregate[0].alias, dir: 'desc', alias: aggregate[0].alias });
  }
  return { groupBy, aggregate, orderBy };
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
  if (spec.groupBy && !isAggregate) {
    ctx.issues.add(`${at}.groupBy`, 'MODE_CONFLICT', 'groupBy needs aggregate');
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
    const { groupBy, aggregate, orderBy } = normalizeAggregate(ctx, resource, spec, at);
    return {
      name,
      resource,
      mode: 'aggregate',
      select: [],
      include: [],
      where: where?.tree,
      wherePaths: where?.paths ?? new Map(),
      window,
      groupBy,
      aggregate,
      orderBy,
      limit: Math.min(limit, ctx.limits.maxLimit),
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
    where: where?.tree,
    wherePaths: where?.paths ?? new Map(),
    window,
    groupBy: [],
    aggregate: [],
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
  const ctx: Ctx = { catalog, scope, limits, now, issues, resources: new Set() };

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
