import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';

import type { QueryReportTable } from './data.type';

/** Rows a query contributes to a PDF; the rest is marked truncated. */
export const QUERY_REPORT_MAX_ROWS = 500;
const MAX_CELL = 300;

/** A cell's text: nested rows as `a, b`, lists of rows as their first values. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          const first = Object.entries(item as Record<string, unknown>).find(([k]) => k !== 'id');
          return first ? cellText(first[1]) : '';
        }
        return cellText(item);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value) ?? '';
}

/** Flattens a row: `{ host: { value } }` becomes the column `host.value`. */
export function flattenRow(row: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(out, flattenRow(value as Record<string, unknown>, path));
    else out[path] = value;
  }
  return out;
}

/** Turns a batch result into one table per query, ids left out. */
export function toReportTables(result: QueryBatchResult): QueryReportTable[] {
  return Object.entries(result.data).map(([name, outcome]) => {
    if ('error' in outcome) return { name, columns: [], rows: [], truncated: false, error: outcome.error.message };
    const flat = outcome.rows.map((row) => flattenRow(row));
    const all = [...new Set(flat.flatMap((row) => Object.keys(row)))];
    // A relation that is null on some rows is not a column of its own when its fields are.
    const columns = all.filter(
      (c) => c !== 'id' && !c.endsWith('.id') && !all.some((other) => other.startsWith(`${c}.`)),
    );
    const rows = flat.slice(0, QUERY_REPORT_MAX_ROWS).map((row) =>
      columns.map((column) => {
        const text = cellText(row[column]);
        return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text;
      }),
    );
    return {
      name,
      columns,
      rows,
      truncated: outcome.truncated || flat.length > QUERY_REPORT_MAX_ROWS || Boolean(outcome.nextCursor),
    };
  });
}
