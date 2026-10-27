/**
 * Splits a notification route into what the router's `<Link>` takes: `to`
 * is read as a path only, so a query (`/targets/x/inventory?tab=urls`) has to
 * travel in `search`.
 */
export function splitNotificationUrl(url: string): {
  to: string;
  search?: Record<string, string>;
} {
  const [to, query] = url.split('?');
  return query
    ? { to, search: Object.fromEntries(new URLSearchParams(query)) }
    : { to };
}
