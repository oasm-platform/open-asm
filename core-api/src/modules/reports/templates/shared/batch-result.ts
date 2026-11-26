import { AsqError, type AsqErrorCode } from '@/modules/attack-surface-query/domain/query-errors';
import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';

/** Rows of a named query. A failed query fails the whole report: a PDF with a silently empty section is wrong. */
export function rowsOf(results: QueryBatchResult[], name: string): Record<string, unknown>[] {
  for (const batch of results) {
    const result = batch.data[name];
    if (!result) continue;
    if ('error' in result) throw new AsqError(result.error.code as AsqErrorCode, result.error.message);
    return result.rows;
  }
  throw new AsqError('INTERNAL', `Query "${name}" returned no result`);
}

/** Counts may arrive as numeric strings (pg bigint) or null. */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}
