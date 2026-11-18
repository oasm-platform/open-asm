import { createHash } from 'node:crypto';

/** Deterministic JSON: object keys sorted at every level, undefined dropped. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (s: string): string =>
  createHash('sha256').update(s).digest('base64url');

/**
 * What a cursor is bound to: the query as written, minus the paging fields.
 * A cursor of another query, or of the same query with another filter or
 * order, is refused.
 */
export function querySignature(spec: Record<string, unknown>): string {
  const rest = Object.fromEntries(
    Object.entries(spec).filter(([key]) => key !== 'cursor' && key !== 'limit' && key !== 'withTotal'),
  );
  return sha256(stableJson(rest)).slice(0, 22);
}
