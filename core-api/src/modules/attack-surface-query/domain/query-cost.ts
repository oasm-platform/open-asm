import type { FilterTree } from '@/common/utils/filter-tree';

import type { ResolvedPath } from '../catalog/paths';
import { AsqError } from './query-errors';
import type { AsqLimits } from './query-limits';
import type { NormalizedInclude, NormalizedQuery } from './query.types';

/** One-relation chains a set of paths needs (`host`, `host.target`). */
export function joinChains(paths: Iterable<ResolvedPath>): Set<string> {
  const chains = new Set<string>();
  for (const path of paths) {
    const names: string[] = [];
    for (const hop of path.hops) {
      if (hop.kind === 'many') break;
      names.push(hop.name);
      chains.add(names.join('.'));
    }
    for (const required of path.field.requires ?? []) {
      chains.add([...names, required].join('.'));
    }
  }
  return chains;
}

function conditions(tree: FilterTree | undefined) {
  if (!tree) return [];
  return tree.items.flatMap((item) => ('conditions' in item ? item.conditions : [item]));
}

function includeCost(rootLimit: number, include: NormalizedInclude, parentRows: number): number {
  const rows = parentRows * include.limit;
  const joins = joinChains(include.select).size;
  const own = rows * 0.5 * (1 + 0.2 * joins);
  return own + include.include.reduce((sum, child) => sum + includeCost(rootLimit, child, rows), 0);
}

export interface QueryCostBreakdown {
  cost: number;
  hints: string[];
}

/**
 * Static cost of one query, before it reaches the database: rows × joins,
 * included rows, EXISTS tests, unindexed text search, heavy columns, totals.
 * A heuristic: the pre-flight EXPLAIN (engine/preflight.ts) is the check that
 * knows the data size.
 */
export function estimateCost(query: NormalizedQuery): QueryCostBreakdown {
  const hints = new Set<string>();
  const allPaths = [
    ...query.select,
    ...query.orderBy.flatMap((o) => (o.path ? [o.path] : [])),
    ...query.groupBy.map((g) => g.path),
    ...query.aggregate.flatMap((a) => (a.path ? [a.path] : [])),
    ...query.wherePaths.values(),
    ...(query.window ? [query.window.path] : []),
  ];
  const joins = joinChains(allPaths).size;
  let cost = 10 + query.limit * (1 + 0.2 * joins);

  const includes = query.include.reduce((sum, inc) => sum + includeCost(query.limit, inc, query.limit), 0);
  cost += includes;
  if (includes > 200) {
    hints.add(
      'each include fetches up to its own limit per row: keep limit × include limit small (e.g. limit 50 with include limit 5), or query the child resource directly with a filter',
    );
  }

  const conds = conditions(query.where);
  for (const c of conds) {
    const path = query.wherePaths.get(c.field);
    if (!path) continue;
    if (path.hops.some((h) => h.kind === 'many')) cost += 50;
    if ((c.op === 'contains' || c.op === 'notContains') && path.field.costlyContains) {
      cost += 200;
      hints.add(`use eq/in instead of contains on ${path.path} (no text index)`);
    }
    if (path.field.cte === 'fresh') cost += 30;
  }
  for (const p of query.select) {
    if (p.field.heavy) cost += query.limit * 2;
    if (p.field.cte === 'fresh') cost += 30;
  }
  if (query.withTotal) {
    cost += 200;
    hints.add('drop withTotal');
  }
  if (query.mode === 'aggregate') cost += 100 + 50 * query.groupBy.length;

  const hasIndexedFilter = conds.some((c) => {
    const path = query.wherePaths.get(c.field);
    return path && path.hops.length === 0 && (c.op === 'eq' || c.op === 'in') && (path.field.sortable === 'indexed' || path.field.type === 'uuid');
  });
  if (!query.window && !hasIndexedFilter) {
    cost += 150;
    hints.add('add a window (e.g. "window": { "since": "now-7d" })');
  }
  if (query.limit > 100) hints.add('lower limit');
  return { cost: Math.round(cost), hints: [...hints] };
}

/** Throws COST_EXCEEDED when a query is over the caller's budget. */
export function assertWithinBudget(query: NormalizedQuery, limits: AsqLimits): number {
  const { cost, hints } = estimateCost(query);
  if (cost > limits.costBudget) {
    throw new AsqError(
      'COST_EXCEEDED',
      `Query "${query.name}" is too broad (cost ${cost}, budget ${limits.costBudget})`,
      { cost, budget: limits.costBudget, hints },
    );
  }
  return cost;
}
