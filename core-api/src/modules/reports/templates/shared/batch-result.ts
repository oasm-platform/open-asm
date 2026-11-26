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

/**
 * Throws the first failed query in execution order. After a timeout in a consistent batch the later statements
 * fail with 25P02 (INTERNAL), so reading in a mapper's own order could report that instead of the real cause.
 */
export function firstError(results: QueryBatchResult[]): void {
  for (const batch of results) {
    for (const result of Object.values(batch.data)) {
      if ('error' in result) throw new AsqError(result.error.code as AsqErrorCode, result.error.message);
    }
  }
}

/** Counts may arrive as numeric strings (pg bigint) or null. */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

export type Row = Record<string, unknown>;

/** Nested value by path (`['host', 'target', 'value']`); undefined when a step is not an object. */
export function at(row: unknown, ...path: string[]): unknown {
  let cur = row;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Row)[key];
  }
  return cur;
}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
