import type { Catalog, FieldType } from '../catalog/catalog.types';
import { SCOPE_COLUMN } from '../catalog/catalog.types';
import type { ResolvedPath } from '../catalog/paths';
import type {
  NormalizedInclude,
  NormalizedOrder,
  NormalizedQuery,
} from '../domain/query.types';
import { compileWhere } from './compile-where';
import { keysetPredicate, type CursorValue, type KeysetColumn } from './cursor';
import {
  expand,
  FromBuilder,
  ParamBag,
  PG_SCALAR_TYPE,
  q,
  scopePredicates,
  selectExpr,
  withClause,
  type CompiledSql,
  type ScopeParams,
} from './sql-builder';

/** One output column and where its value goes in the row object. */
export interface ShapeColumn {
  alias: string;
  /** Nesting path, e.g. ['host', 'value']. */
  path: string[];
  type: FieldType;
}

/** A selected one-relation: its row is `null` when its id column is NULL. */
export interface ShapeRelation {
  path: string[];
  idAlias: string;
}

export interface ShapeSpec {
  columns: ShapeColumn[];
  relations: ShapeRelation[];
}

export interface IncludePlan {
  name: string;
  /** Hidden column of the parent rows holding the key children point at. */
  parentKeyAlias: string;
  /** SQL fetching the children of the given parent keys. */
  build: (keys: string[]) => CompiledSql;
  shape: ShapeSpec;
  children: IncludePlan[];
}

export interface SortColumn {
  alias: string;
  cast: string;
}

export interface QueryPlan {
  name: string;
  mode: 'list' | 'aggregate';
  /** Root statement; list mode fetches `limit + 1` rows. */
  root: CompiledSql;
  total?: CompiledSql;
  shape: ShapeSpec;
  includes: IncludePlan[];
  limit: number;
  /** Hidden sort columns (last = id) used to build the next cursor. */
  sortColumns: SortColumn[];
  /** The sort cannot use an index: the pre-flight bounds its row count. */
  boundedSort: boolean;
  signature: string;
}

export const TOTAL_CAP = 10_000;

const nullsLast = (dir: string) => `${dir.toUpperCase()} NULLS LAST`;

/** A time as UTC ISO 8601 text with microseconds (NULL stays NULL). */
export const exactInstantSql = (sql: string): string =>
  `to_char((${sql})::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Cast of a sort value bound back into a keyset predicate. */
function castOf(type: FieldType): string {
  return PG_SCALAR_TYPE[type] ?? (type === 'uuid' ? 'uuid' : type === 'bool' ? 'boolean' : type === 'ip' ? 'inet' : 'text');
}

/** Adds the selected columns of `select` to `cols`; returns the shape. */
function selectColumns(from: FromBuilder, select: ResolvedPath[], cols: string[]): ShapeSpec {
  const shape: ShapeSpec = { columns: [], relations: [] };
  const rootId = 'c_id';
  cols.push(`${from.aliasOf([])}.id AS ${q(rootId)}`);
  shape.columns.push({ alias: rootId, path: ['id'], type: 'uuid' });
  const relationIds = new Map<string, string>();
  for (const [i, path] of select.entries()) {
    const chain = FromBuilder.oneChain(path);
    const alias = `c${i}`;
    cols.push(`${selectExpr(from.pathSql(path), path.field)} AS ${q(alias)}`);
    shape.columns.push({ alias, path: [...chain, path.fieldName], type: path.field.type });
    for (let depth = 1; depth <= chain.length; depth++) {
      const key = chain.slice(0, depth).join('.');
      if (relationIds.has(key)) continue;
      const idAlias = `r${relationIds.size}`;
      relationIds.set(key, idAlias);
      cols.push(`${from.aliasOf(chain.slice(0, depth))}.id AS ${q(idAlias)}`);
      shape.relations.push({ path: chain.slice(0, depth), idAlias });
    }
  }
  return shape;
}

function orderSql(from: FromBuilder, orderBy: NormalizedOrder[]): { exprs: string[]; columns: KeysetColumn[] } {
  const exprs: string[] = [];
  const columns: KeysetColumn[] = [];
  for (const order of orderBy) {
    const path = order.path!;
    const sql = from.pathSql(path);
    exprs.push(`${sql} ${nullsLast(order.dir)}`);
    columns.push({
      sql,
      dir: order.dir,
      cast: castOf(path.field.type),
      nullable: path.field.nullable === true || path.hops.length > 0,
    });
  }
  return { exprs, columns };
}

function compileInclude(
  include: NormalizedInclude,
  parentFrom: FromBuilder,
  parentCols: string[],
  scope: ScopeParams,
  params: ParamBag,
  counter: { n: number },
  queryPrefix: string,
): IncludePlan {
  const index = counter.n++;
  const parentKeyAlias = `k${index}`;
  parentCols.push(`${expand(include.def.parentKey, { a: parentFrom.aliasOf([]) })} AS ${q(parentKeyAlias)}`);

  const childAlias = `i${index}`;
  const from = new FromBuilder(parentFrom.catalog, include.resource, childAlias);
  const child = from.aliasOf([]);
  const cols: string[] = [];
  const shape = selectColumns(from, include.select, cols);
  const children = include.include.map((nested) =>
    compileInclude(nested, from, cols, scope, params, counter, queryPrefix),
  );
  const order = orderSql(from, include.orderBy);
  const childParams = new ParamBag(`${queryPrefix}i${index}_`);
  const where = compileWhere(from, include.where, include.wherePaths, scope, `${queryPrefix}i${index}_w`);
  if (where) childParams.merge(where.params);
  const predicates = [
    `${child}.${include.def.childKey} = asq_p.k`,
    `${child}.${SCOPE_COLUMN} = ${scope.workspace}`,
    ...(include.def.extra ? [`(${expand(include.def.extra, { c: child })})`] : []),
    ...(include.resource.basePredicate ? [`(${expand(include.resource.basePredicate, { a: child })})`] : []),
    ...(where ? [where.sql] : []),
  ];
  const fresh = from.usesFreshCte;

  return {
    name: include.name,
    parentKeyAlias,
    shape,
    children,
    build: (keys: string[]) => {
      const bag = new ParamBag(`${queryPrefix}i${index}b_`);
      bag.merge(params.values);
      bag.merge(childParams.values);
      const keysParam = bag.add(keys);
      const perParent = bag.add(include.limit);
      const sql = `${withClause(fresh, scope.workspace)}SELECT asq_p.k AS "__parent", asq_c.*
FROM unnest(CAST(${keysParam} AS uuid[])) WITH ORDINALITY AS asq_p(k, ord)
CROSS JOIN LATERAL (
  SELECT ${cols.join(', ')}
  FROM ${from.renderFrom()}
  WHERE ${predicates.join('\n    AND ')}
  ORDER BY ${[...order.exprs, `${child}.id ASC`].join(', ')}
  LIMIT ${perParent}
) asq_c
ORDER BY asq_p.ord`;
      return { sql, params: bag.values };
    },
  };
}

/**
 * Compiles one validated query. Every statement starts its WHERE with the
 * workspace predicate on the root's own `workspaceId` column; every other
 * block (project, base predicate, window, the caller's filter, keyset) is
 * its own parenthesized AND term, so an `or` in the filter cannot escape it.
 */
export function planQuery(
  catalog: Catalog,
  query: NormalizedQuery,
  scopeValues: { workspaceId: string; projectId?: string | null },
  cursorKeys: CursorValue[] | undefined,
  index: number,
): QueryPlan {
  const prefix = `asq_q${index}_`;
  const params = new ParamBag(prefix);
  const scope: ScopeParams = {
    workspace: params.add(scopeValues.workspaceId),
    project: scopeValues.projectId ? params.add(scopeValues.projectId) : undefined,
  };
  const from = new FromBuilder(catalog, query.resource, 'r');
  const root = from.aliasOf([]);
  const terms = scopePredicates(query.resource, root, scope);

  if (query.window) {
    const sql = from.pathSql(query.window.path);
    terms.push(
      `(${sql} >= CAST(${params.add(query.window.since.toISOString())} AS timestamptz) AND ${sql} < CAST(${params.add(query.window.until.toISOString())} AS timestamptz))`,
    );
  }
  const where = compileWhere(from, query.where, query.wherePaths, scope, `${prefix}w`);
  if (where) {
    params.merge(where.params);
    terms.push(where.sql);
  }

  if (query.mode === 'aggregate') {
    const cols: string[] = [];
    const groups: string[] = [];
    const shape: ShapeSpec = { columns: [], relations: [] };
    for (const [i, group] of query.groupBy.entries()) {
      const sql = from.pathSql(group.path);
      const expr = group.bucket
        ? `date_trunc('${group.bucket}', ${sql}::timestamptz, 'UTC')`
        : selectExpr(sql, group.path.field);
      cols.push(`${expr} AS ${q(`g${i}`)}`);
      groups.push(expr);
      shape.columns.push({ alias: `g${i}`, path: group.key.split('.'), type: group.path.field.type });
    }
    for (const [i, agg] of query.aggregate.entries()) {
      const sql = agg.path ? from.pathSql(agg.path) : '';
      const expr =
        agg.fn === 'count'
          ? agg.path ? `COUNT(${sql})::int8` : 'COUNT(*)::int8'
          : agg.fn === 'countDistinct'
            ? `COUNT(DISTINCT ${sql})::int8`
            : agg.fn === 'avg'
              ? `AVG(${sql})::float8`
              : `${agg.fn.toUpperCase()}(${selectExpr(sql, agg.path!.field)})`;
      cols.push(`${expr} AS ${q(`a${i}`)}`);
      shape.columns.push({
        alias: `a${i}`,
        path: [agg.alias],
        type: agg.fn === 'count' || agg.fn === 'countDistinct' ? 'int' : agg.fn === 'avg' ? 'float' : agg.path!.field.type,
      });
    }
    const orderExprs = query.orderBy.map((o) => {
      if (o.alias) return `${q(`a${query.aggregate.findIndex((a) => a.alias === o.alias)}`)} ${nullsLast(o.dir)}`;
      return `${q(`g${query.groupBy.findIndex((g) => g.key === o.key)}`)} ${nullsLast(o.dir)}`;
    });
    for (const [i, group] of query.groupBy.entries()) {
      if (!query.orderBy.some((o) => o.key === group.key)) orderExprs.push(`${q(`g${i}`)} ASC NULLS LAST`);
    }
    const limit = params.add(query.limit);
    const sql = `${withClause(from.usesFreshCte, scope.workspace)}SELECT ${cols.join(', ')}
FROM ${from.renderFrom()}
WHERE ${terms.join('\n  AND ')}${groups.length ? `\nGROUP BY ${groups.join(', ')}` : ''}${orderExprs.length ? `\nORDER BY ${orderExprs.join(', ')}` : ''}
LIMIT ${limit}`;
    return {
      name: query.name,
      mode: 'aggregate',
      root: { sql, params: params.values },
      shape,
      includes: [],
      limit: query.limit,
      sortColumns: [],
      boundedSort: false,
      signature: query.signature,
    };
  }

  const cols: string[] = [];
  const shape = selectColumns(from, query.select, cols);
  const counter = { n: 0 };
  const includes = query.include.map((inc) => compileInclude(inc, from, cols, scope, params, counter, prefix));

  const order = orderSql(from, query.orderBy);
  const idDir = query.orderBy.length ? query.orderBy[query.orderBy.length - 1].dir : 'asc';
  const keyset: KeysetColumn[] = [...order.columns, { sql: `${root}.id`, dir: idDir, cast: 'uuid', nullable: false }];
  // Times leave as ISO text with microseconds: a JS Date keeps only
  // milliseconds, and rows sharing a millisecond would be skipped on the next
  // page. The keyset predicate casts the text back to the same instant.
  const sortColumns: SortColumn[] = keyset.map((col, i) => {
    const expr = col.cast === 'timestamptz' ? exactInstantSql(col.sql) : col.sql;
    cols.push(`${expr} AS ${q(`s${i}`)}`);
    return { alias: `s${i}`, cast: col.cast };
  });

  const filterTerms = [...terms];
  if (cursorKeys) terms.push(`(${keysetPredicate(keyset, cursorKeys, (v) => params.add(v))})`);

  const limit = params.add(query.limit + 1);
  const sql = `${withClause(from.usesFreshCte, scope.workspace)}SELECT ${cols.join(', ')}
FROM ${from.renderFrom()}
WHERE ${terms.join('\n  AND ')}
ORDER BY ${[...order.exprs, `${root}.id ${idDir.toUpperCase()}`].join(', ')}
LIMIT ${limit}`;

  const total = query.withTotal
    ? {
        sql: `${withClause(from.usesFreshCte, scope.workspace)}SELECT COUNT(*)::int8 AS n FROM (
  SELECT 1 FROM ${from.renderFrom()}
  WHERE ${filterTerms.join('\n    AND ')}
  LIMIT ${TOTAL_CAP + 1}
) asq_t`,
        params: params.values,
      }
    : undefined;

  const boundedSort = query.orderBy.some(
    (o) => o.path && (o.path.field.sortable !== 'indexed' || o.path.hops.length > 0),
  );

  return {
    name: query.name,
    mode: 'list',
    root: { sql, params: params.values },
    total,
    shape,
    includes,
    limit: query.limit,
    sortColumns,
    boundedSort,
    signature: query.signature,
  };
}

/** Number of sort keys a cursor of this query carries (orderBy + id). */
export function cursorKeyCount(query: NormalizedQuery): number {
  return query.orderBy.length + 1;
}
