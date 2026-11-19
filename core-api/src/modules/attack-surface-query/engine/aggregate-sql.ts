import type { FieldType } from '../catalog/catalog.types';
import type { HavingNode, NormalizedAggregate, NormalizedQuery } from '../domain/query.types';
import { type ParamBag, PG_SCALAR_TYPE, q, selectExpr } from './sql-builder';

/** SQL of one aggregate over `sql` (its field), counting only `filter` rows. */
export function aggregateExpr(agg: NormalizedAggregate, sql: string, filter?: string): string {
  const only = filter ? ` FILTER (WHERE ${filter})` : '';
  // Without a filter the SQL is the one ASQ always emitted.
  const cast = (call: string, type: string) => (filter ? `(${call}${only})::${type}` : `${call}::${type}`);
  switch (agg.fn) {
    case 'count':
      return cast(agg.path ? `COUNT(${sql})` : 'COUNT(*)', 'int8');
    case 'countDistinct':
      return cast(`COUNT(DISTINCT ${sql})`, 'int8');
    case 'avg':
      return cast(`AVG(${sql})`, 'float8');
    case 'sum':
      return cast(`SUM(${sql})`, 'float8');
    case 'min':
    case 'max':
      return `${agg.fn.toUpperCase()}(${selectExpr(sql, agg.path!.field)})${only}`;
  }
}

/** Scalar type a `having` value is cast to. */
function castOf(type: FieldType): string {
  if (PG_SCALAR_TYPE[type]) return PG_SCALAR_TYPE[type];
  switch (type) {
    case 'bool':
      return 'boolean';
    case 'uuid':
      return 'uuid';
    case 'ip':
      return 'inet';
    default:
      return 'text';
  }
}

const CMP = { gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;

/**
 * Compiles a validated `having` tree. It repeats the group and aggregate
 * expressions (an output alias is not visible in HAVING); values are params.
 */
export function compileHaving(node: HavingNode, groups: string[], aggregates: string[], params: ParamBag): string {
  switch (node.kind) {
    case 'group':
      return `(${node.items.map((item) => compileHaving(item, groups, aggregates, params)).join(node.logic === 'or' ? ' OR ' : ' AND ')})`;
    case 'not':
      return `NOT (${compileHaving(node.item, groups, aggregates, params)})`;
    case 'cond': {
      const expr = node.ref.kind === 'group' ? groups[node.ref.index] : aggregates[node.ref.index];
      const type = castOf(node.type);
      // An aggregate of no rows is NULL: the test is false, `not` keeps it.
      const guard = (sql: string) => `COALESCE(${sql}, false)`;
      switch (node.op) {
        case 'eq':
        case 'in':
          return `(${guard(`${expr} = ANY(CAST(${params.add(node.values)} AS ${type}[]))`)})`;
        case 'neq':
        case 'notIn':
          return `NOT (${guard(`${expr} = ANY(CAST(${params.add(node.values)} AS ${type}[]))`)})`;
        default:
          return `(${guard(`${expr} ${CMP[node.op]} CAST(${params.add(node.values[0])} AS ${type})`)})`;
      }
    }
  }
}

/** Aggregates whose empty bucket reads 0 rather than NULL. */
const ZERO_WHEN_EMPTY = new Set(['count', 'countDistinct', 'sum']);

/**
 * Wraps a grouped statement (one time group, `g0`) in a series of every
 * bucket of the window: empty buckets come back with 0 counts. The bounds are
 * params; the bucket comes from a validated enum.
 */
export function fillSeries(query: NormalizedQuery, grouped: string, tz: string, params: ParamBag): string {
  const window = query.window!;
  const bucket = query.groupBy[0].bucket!;
  const since = params.add(window.since.toISOString());
  const until = params.add(window.until.toISOString());
  const values = query.aggregate.map((agg, i) => {
    const col = `asq_f.${q(`a${i}`)}`;
    return `${ZERO_WHEN_EMPTY.has(agg.fn) ? `COALESCE(${col}, 0)` : col} AS ${q(`a${i}`)}`;
  });
  return `SELECT asq_s.g AS "g0", ${values.join(', ')}
FROM generate_series(date_trunc('${bucket}', CAST(${since} AS timestamptz), ${tz}), CAST(${until} AS timestamptz), interval '1 ${bucket}', ${tz}) AS asq_s(g)
LEFT JOIN (
${grouped}
) asq_f ON asq_f."g0" = asq_s.g`;
}
