import { AsqError } from '../domain/query-errors';
import type { AsqLimits } from '../domain/query-limits';

interface PlanNode {
  'Node Type'?: string;
  'Total Cost'?: number;
  'Plan Rows'?: number;
  Plans?: PlanNode[];
}

export interface PlanEstimate {
  totalCost: number;
  /** Largest estimated input of a Sort node (0 when none). */
  sortRows: number;
}

/** Reads `EXPLAIN (FORMAT JSON)` output: total cost and the biggest sort. */
export function readPlan(explain: unknown): PlanEstimate {
  const rows = explain as Array<{ 'QUERY PLAN'?: unknown }>;
  const doc = rows?.[0]?.['QUERY PLAN'];
  const parsed = (typeof doc === 'string' ? JSON.parse(doc) : doc) as Array<{ Plan?: PlanNode }>;
  const top = parsed?.[0]?.Plan;
  if (!top) return { totalCost: 0, sortRows: 0 };
  let sortRows = 0;
  const walk = (node: PlanNode) => {
    if (node['Node Type'] === 'Sort' || node['Node Type'] === 'Incremental Sort') {
      const input = node.Plans?.[0]?.['Plan Rows'] ?? node['Plan Rows'] ?? 0;
      sortRows = Math.max(sortRows, input);
    }
    node.Plans?.forEach(walk);
  };
  walk(top);
  return { totalCost: top['Total Cost'] ?? 0, sortRows };
}

/**
 * Refuses a statement the planner expects to be too expensive for the
 * caller: a coarse gate before execution (planner estimates can be off; the
 * statement timeout stays the last line).
 */
export function assertPlanWithinLimits(
  name: string,
  estimate: PlanEstimate,
  limits: AsqLimits,
  boundedSort: boolean,
): void {
  if (estimate.totalCost > limits.maxPlannerCost) {
    throw new AsqError(
      'COST_EXCEEDED',
      `Query "${name}" would scan too much data (planner cost ${Math.round(estimate.totalCost)}, limit ${limits.maxPlannerCost})`,
      {
        cost: Math.round(estimate.totalCost),
        budget: limits.maxPlannerCost,
        hints: ['add a window', 'filter on an indexed field (eq/in)', 'lower limit'],
      },
    );
  }
  if (boundedSort && estimate.sortRows > limits.maxSortRows) {
    throw new AsqError(
      'COST_EXCEEDED',
      `Query "${name}" sorts about ${Math.round(estimate.sortRows)} rows on an unindexed field`,
      {
        estimatedRows: Math.round(estimate.sortRows),
        hints: ['sort by firstSeen (indexed)', 'add a window or a narrower filter'],
      },
    );
  }
}
