import {
  compileFilter,
  type FilterFieldSpec,
  type FilterSchema,
  type FilterTree,
} from '@/common/utils/filter-tree';

import { fieldOps } from '../catalog/catalog';
import type { FieldDef } from '../catalog/catalog.types';
import { SCOPE_COLUMN } from '../catalog/catalog.types';
import type { ResolvedPath } from '../catalog/paths';
import {
  expand,
  FromBuilder,
  PG_ARRAY_TYPE,
  PG_SCALAR_TYPE,
  type ScopeParams,
} from './sql-builder';

/** The value tests of one field expression, by operator family. */
function fieldSpec(expr: string, field: FieldDef): Omit<FilterFieldSpec, 'ops' | 'check'> {
  const guard = (sql: string) => (field.nullable ? `COALESCE(${sql}, false)` : sql);
  const arrayType = PG_ARRAY_TYPE[field.type] ?? 'text[]';
  const scalarType = PG_SCALAR_TYPE[field.type];
  if (field.type === 'textArray') {
    return {
      any: (p) => guard(`${expr} && CAST(${p} AS text[])`),
      like: (p) => `EXISTS (SELECT 1 FROM unnest(${expr}) asq_el WHERE asq_el ILIKE ${p})`,
    };
  }
  return {
    any: (p) => guard(`${expr} = ANY(CAST(${p} AS ${arrayType}))`),
    like: (p) => guard(`${expr} ILIKE ${p}`),
    subnet: (p) => guard(`${expr} <<= ANY(CAST(${p} AS inet[]))`),
    cmp: (p, op) => guard(`${expr} ${op} CAST(${p} AS ${scalarType ?? 'text'})`),
  };
}

/**
 * Wraps a child test in `EXISTS`: "at least one related row matches". A
 * negated operator (`neq`, `notIn`, `notContains`) therefore reads "no
 * related row matches", because compileFilter negates the whole fragment.
 */
function existsSpec(
  from: FromBuilder,
  path: ResolvedPath,
  scope: ScopeParams,
  subAlias: string,
): Omit<FilterFieldSpec, 'ops' | 'check'> {
  const manyIndex = path.hops.findIndex((h) => h.kind === 'many');
  const hop = path.hops[manyIndex];
  if (hop.kind !== 'many') throw new Error('AttackSurfaceQuery compiler: expected a list hop');
  const parentChain = FromBuilder.oneChain(path);
  from.ensureChain(parentChain);
  const parentAlias = from.aliasOf(parentChain);

  const inner = new FromBuilder(from.catalog, hop.to, subAlias);
  const innerChain = path.hops.slice(manyIndex + 1).map((h) => h.name);
  const expr = inner.fieldSql(innerChain, path.field);
  if (inner.usesFreshCte) from.usesFreshCte = true;
  const child = inner.aliasOf([]);
  const correlation = [
    `${child}.${hop.def.childKey} = ${expand(hop.def.parentKey, { a: parentAlias })}`,
    `${child}.${SCOPE_COLUMN} = ${scope.workspace}`,
    ...(hop.def.extra ? [`(${expand(hop.def.extra, { c: child, a: parentAlias })})`] : []),
    ...(hop.to.basePredicate ? [`(${expand(hop.to.basePredicate, { a: child })})`] : []),
  ].join(' AND ');
  const test = fieldSpec(expr, path.field);
  const wrap = (sql: string) => `EXISTS (SELECT 1 FROM ${inner.renderFrom()} WHERE ${correlation} AND ${sql})`;
  return {
    any: (p) => wrap(test.any(p)),
    like: test.like && ((p) => wrap(test.like!(p))),
    subnet: test.subnet && ((p) => wrap(test.subnet!(p))),
    cmp: test.cmp && ((p, op) => wrap(test.cmp!(p, op))),
  };
}

/**
 * Compiles a validated `where` tree against `from`: one-relation paths join
 * into the statement, list paths become correlated EXISTS. Values go into
 * params only (compileFilter); the result is one parenthesized fragment.
 */
export function compileWhere(
  from: FromBuilder,
  where: FilterTree | undefined,
  paths: ReadonlyMap<string, ResolvedPath>,
  scope: ScopeParams,
  prefix: string,
): { sql: string; params: Record<string, unknown> } | null {
  if (!where || where.items.length === 0) return null;
  const schema: FilterSchema<string> = {};
  let sub = 0;
  for (const [name, path] of paths) {
    const hasMany = path.hops.some((h) => h.kind === 'many');
    const tests = hasMany
      ? existsSpec(from, path, scope, `${from.rootAlias}_x${sub++}`)
      : fieldSpec(from.pathSql(path), path.field);
    schema[name] = { ops: fieldOps(path.field), ...tests };
  }
  return compileFilter(schema, where, prefix);
}
