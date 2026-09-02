export function truncateUrl(url: string, maxLength = 60): string {
  if (url.length <= maxLength) return url;
  const start = url.slice(0, Math.floor(maxLength / 2));
  const end = url.slice(-Math.floor(maxLength / 2));
  return `${start}...${end}`;
}
/** Convert a camelCase identifier to a human-readable title, e.g. `excludeTags` → `Exclude Tags`. */
export function camelToTitle(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
