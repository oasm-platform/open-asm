export function truncateUrl(url: string, maxLength = 60): string {
  if (url.length <= maxLength) return url;
  const start = url.slice(0, Math.floor(maxLength / 2));
  const end = url.slice(-Math.floor(maxLength / 2));
  return `${start}...${end}`;
}