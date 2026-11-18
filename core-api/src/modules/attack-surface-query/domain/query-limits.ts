import type { QueryMode } from './query.schema';
import type { AsqCaller } from './query.types';

export interface AsqLimits {
  queriesPerBatch: number;
  selectFields: number;
  includesPerQuery: number;
  includeDepth: number;
  defaultLimit: number;
  maxLimit: number;
  defaultIncludeLimit: number;
  maxIncludeLimit: number;
  groupBy: number;
  aggregates: number;
  orderBy: number;
  /** Static cost budget per query (domain/query-cost.ts). */
  costBudget: number;
  /** Planner `Total Cost` above which the pre-flight refuses (engine/preflight.ts). */
  maxPlannerCost: number;
  /** Estimated rows a `bounded` sort may sort. */
  maxSortRows: number;
  statementTimeoutMs: number;
  batchBudgetMs: number;
  /** Serialized response size. */
  maxResponseBytes: number;
  /** Strings longer than this are cut. */
  maxStringLength: number;
  allowHeavy: boolean;
}

const HTTP: AsqLimits = {
  queriesPerBatch: 10,
  selectFields: 30,
  includesPerQuery: 5,
  includeDepth: 2,
  defaultLimit: 50,
  maxLimit: 1000,
  defaultIncludeLimit: 10,
  maxIncludeLimit: 50,
  groupBy: 3,
  aggregates: 5,
  orderBy: 3,
  costBudget: 1000,
  maxPlannerCost: 200_000,
  maxSortRows: 200_000,
  statementTimeoutMs: 5_000,
  batchBudgetMs: 15_000,
  maxResponseBytes: 5 * 1024 * 1024,
  maxStringLength: 2000,
  allowHeavy: true,
};

const AGENT: AsqLimits = {
  ...HTTP,
  queriesPerBatch: 5,
  selectFields: 20,
  includesPerQuery: 3,
  maxLimit: 200,
  defaultIncludeLimit: 5,
  maxIncludeLimit: 20,
  // A full page (200 rows) of any resource, all time, with a total, and an
  // all-time count fit; include fan-out and unindexed searches over large
  // pages do not. The pre-flight EXPLAIN (maxPlannerCost) gates real size.
  costBudget: 1000,
  maxPlannerCost: 50_000,
  maxSortRows: 50_000,
  statementTimeoutMs: 3_000,
  batchBudgetMs: 8_000,
  maxResponseBytes: 64 * 1024,
  maxStringLength: 512,
  allowHeavy: false,
};

/** Report mode: async job, long timeouts, large result sets (HTTP only). */
const REPORT: AsqLimits = {
  ...HTTP,
  maxLimit: 50_000,
  costBudget: 60_000,
  maxPlannerCost: 4_000_000,
  maxSortRows: 5_000_000,
  statementTimeoutMs: 120_000,
  batchBudgetMs: 600_000,
  // The result is kept in Redis for an hour: bounded.
  maxResponseBytes: 16 * 1024 * 1024,
};

export function limitsFor(caller: AsqCaller, mode: QueryMode): AsqLimits {
  if (caller !== 'http') return AGENT;
  return mode === 'report' ? REPORT : HTTP;
}
