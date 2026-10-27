import { z } from 'zod';

export interface TableSearchDefaults {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  filter: string;
}

const BASE: TableSearchDefaults = {
  page: 1,
  pageSize: 10,
  sortBy: 'createdAt',
  sortOrder: 'DESC',
  filter: '',
};

/**
 * The search params a server-side table (`useServerDataTable`) reads, for a
 * route's `validateSearch`, and the defaults to hand `stripSearchParams` so they
 * stay out of the URL while unchanged:
 *
 *   search: { middlewares: [stripSearchParams(table.defaults)] }
 *
 * (Called in the route, not here, so it is typed against the route's search.)
 * The defaults still apply when reading, so a table sorts and pages exactly as
 * before; only a value someone changed shows up in the address bar (`?page=2`,
 * not `?page=1&pageSize=10&…&filter=`).
 *
 * @param overrides - Defaults that differ from page 1 / 10 rows / newest first.
 * @param extra - Other defaulted params of the route (e.g. `tab`) to strip too.
 */
export function tableSearch<E extends Record<string, unknown> = Record<never, never>>(
  overrides: Partial<TableSearchDefaults> = {},
  extra?: E,
) {
  const defaults = { ...BASE, ...overrides };
  return {
    shape: {
      page: z.number().default(defaults.page),
      pageSize: z.number().default(defaults.pageSize),
      sortBy: z.string().default(defaults.sortBy),
      sortOrder: z.enum(['ASC', 'DESC']).default(defaults.sortOrder),
      filter: z.string().default(defaults.filter),
    },
    defaults: { ...defaults, ...(extra as E) },
  };
}
