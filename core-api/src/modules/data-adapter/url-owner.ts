/** Default HTTPS and HTTP ports first, then the lowest port. */
const portRank = (port: number): number =>
  port === 443 ? -2 : port === 80 ? -1 : port;

/**
 * The service a discovered URL is stored under, for a URL discovery job that
 * ran on a whole host (a tool taking `host`, like gau or katana) rather than
 * on one service: the service on the URL's own port when the URL is on that
 * host, else the host's main web service (443, then 80, then the lowest
 * port). Undefined when the host has no service to attach it to.
 */
export function serviceForUrl(
  url: string,
  host: string,
  services: ReadonlyArray<{ id: string; port: number }>,
): string | undefined {
  if (services.length === 0) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() === host.toLowerCase()) {
      const port = parsed.port
        ? Number(parsed.port)
        : parsed.protocol === 'http:'
          ? 80
          : 443;
      const own = services.find((service) => service.port === port);
      if (own) return own.id;
    }
  } catch {
    // Not a URL we can parse: it still belongs to the host.
  }
  return [...services].sort((a, b) => portRank(a.port) - portRank(b.port))[0]
    .id;
}
