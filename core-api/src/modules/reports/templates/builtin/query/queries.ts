import { applyParams } from '@/modules/attack-surface-query/domain/query-params';
import type { QueryBatchInput } from '@/modules/attack-surface-query/domain/query.schema';
import { QUERY_REPORT_MAX_ROWS } from './to-data';

export interface QueryReportOptions {
  spec: Record<string, unknown>;
  title: string;
  description?: string | null;
}

/** One row more than the PDF shows, so `toReportTables` can tell the table was cut. */
const MAX_LIMIT = QUERY_REPORT_MAX_ROWS + 1;

/** Caps an explicit limit (the `report` caller allows 10 000); a query without one keeps the engine default. */
function clampLimits(queries: unknown): unknown {
  if (!queries || typeof queries !== 'object') return queries;
  return Object.fromEntries(
    Object.entries(queries).map(([name, q]) => {
      const limit = (q as { limit?: unknown } | null)?.limit;
      return [name, typeof limit === 'number' && limit > MAX_LIMIT ? { ...q, limit: MAX_LIMIT } : q];
    }),
  );
}

export function queryQueries({ spec }: QueryReportOptions): QueryBatchInput[] {
  const options = (spec.options ?? {}) as Record<string, unknown>;
  const applied = applyParams(spec);
  // A saved spec may ask for another mode; a report always runs one consistent snapshot as the caller.
  return [
    { ...applied, queries: clampLimits(applied.queries), options: { ...options, consistent: true, mode: 'interactive' } },
  ] as unknown as QueryBatchInput[];
}
