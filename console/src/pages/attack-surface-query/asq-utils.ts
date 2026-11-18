import { isAxiosError } from 'axios';

/** The batch shown when the playground opens. */
export const DEFAULT_QUERY = `{
  "window": { "since": "now-5d" },
  "queries": {
    "newPorts": {
      "from": "services",
      "select": ["port", "host.value", "http.title", "firstSeen"],
      "limit": 50
    },
    "portSummary": {
      "from": "services",
      "groupBy": ["port"],
      "aggregate": { "hosts": { "fn": "countDistinct", "field": "host.id" } },
      "orderBy": [{ "field": "hosts", "dir": "desc" }],
      "limit": 20
    }
  }
}
`;

export type QueryBatch = {
  queries: Record<string, Record<string, unknown>>;
  window?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type ParsedQuery =
  | { ok: true; value: QueryBatch }
  | { ok: false; message: string };

/** Parses the editor text; checks only the outer shape (the server checks the rest). */
export function parseQueryText(text: string): ParsedQuery {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, message: `Invalid JSON: ${(error as Error).message}` };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'The query must be a JSON object' };
  }
  const queries = (value as { queries?: unknown }).queries;
  if (!queries || typeof queries !== 'object' || Array.isArray(queries)) {
    return { ok: false, message: '"queries" must be an object of named queries' };
  }
  return { ok: true, value: value as QueryBatch };
}

export interface AsqIssue {
  path: string;
  code: string;
  message: string;
}

/** Error of a whole batch, as the API returns it (`{ error: { … } }`). */
export interface AsqErrorBody {
  code: string;
  message: string;
  issues?: AsqIssue[];
  hints?: string[];
  cost?: number;
  budget?: number;
}

/** Reads the ASQ error of a failed request, or a generic one. */
export function asqErrorOf(error: unknown): AsqErrorBody {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: AsqErrorBody; message?: unknown } | undefined;
    if (body?.error && typeof body.error.code === 'string') return body.error;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    return { code: `HTTP_${error.response?.status ?? 'ERROR'}`, message: typeof message === 'string' ? message : error.message };
  }
  return { code: 'ERROR', message: error instanceof Error ? error.message : String(error) };
}

/** `{ host: { value } }` becomes `{ 'host.value': … }`; lists stay as they are. */
export function flattenRow(row: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenRow(value as Record<string, unknown>, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/**
 * Columns of flattened rows, in first-seen order, ids last. A relation that
 * is `null` on some rows (`http: null`) is not a column of its own when its
 * fields (`http.title`) are.
 */
export function columnsOf(rows: Record<string, unknown>[]): string[] {
  const all = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const columns = all.filter((c) => !all.some((other) => other.startsWith(`${c}.`)));
  const isId = (c: string) => c === 'id' || c.endsWith('.id');
  return [...columns.filter((c) => !isId(c)), ...columns.filter(isId)];
}

/** Text of a cell: included lists show their first value per row. */
export function cellText(value: unknown): string {
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
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The batch that fetches the next page of one query. */
export function nextPageBatch(batch: QueryBatch, name: string, cursor: string): QueryBatch {
  return {
    ...batch,
    queries: { [name]: { ...batch.queries[name], cursor } },
    options: { ...(batch.options ?? {}), mode: 'interactive' },
  };
}
