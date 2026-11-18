import { parse } from 'qs';

/**
 * Parses a request's query string the way Express' "extended" parser does,
 * so `?ids=a&ids=b` stays an array and `?filter[x]=1` a nested object.
 *
 * Unlike Express, keys named after `Object.prototype` members
 * (`hasOwnProperty`, `toString`, ...) are dropped: no endpoint takes one, and
 * kept they would shadow the method on the parsed object. qs' own limits
 * (depth 5, 20 array items, 1000 parameters) bound the work per request.
 */
export function parseQuery(query: string): Record<string, unknown> {
  return parse(query, { allowPrototypes: false });
}
