/**
 * Escapes `\`, `%` and `_` so user input matches literally inside a
 * LIKE/ILIKE pattern. Postgres uses `\` as the default LIKE escape character,
 * so no `ESCAPE` clause is needed.
 */
export const escapeLikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, '\\$&');

/** `%value%` with the user input escaped: a literal "contains" match. */
export const containsLikePattern = (value: string): string =>
  `%${escapeLikePattern(value)}%`;
