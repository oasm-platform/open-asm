import { defaultParseSearch } from '@tanstack/react-router';

/**
 * Splits a notification route into what the router's `<Link>` takes: `to`
 * is read as a path only, so a query (`/targets/x/inventory?tab=urls`) has to
 * travel in `search`. The query is parsed the way the router parses the
 * address bar, so `isNew=true` arrives as the boolean a typed link would give.
 */
export function splitNotificationUrl(url: string): {
  to: string;
  search?: Record<string, unknown>;
} {
  const [to, query] = url.split('?');
  return query ? { to, search: defaultParseSearch(`?${query}`) } : { to };
}
