/**
 * Helpers for safely resolving a client-supplied `sortBy` against an
 * allow-list.
 *
 * `QueryBuilder.orderBy()` does NOT parameterize its first argument — it is
 * concatenated into the SQL `ORDER BY` clause verbatim. Interpolating a
 * user-controlled string there is a SQL-injection sink (an audit confirmed
 * values reached Postgres and arbitrary subqueries executed).
 *
 * `GetManyBaseQueryParams.sortBy` now only accepts an identifier-shaped value
 * (see that DTO), which blocks injection at the edge. These helpers are the
 * second layer: they pin each endpoint to the exact columns it supports, so an
 * unknown/typo'd field falls back to a known-good default instead of reaching
 * the query builder at all.
 */

/**
 * Return `requested` only when it is in `allowed`; otherwise `fallback`.
 * `fallback` must itself be a member of `allowed`.
 */
export function resolveSortBy<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(requested as T) ? (requested as T) : fallback;
}
