import type { AgentHttpRequestListItemDto } from '@/services/apis/gen/queries';

type Request = AgentHttpRequestListItemDto;
type Target = Pick<Request, 'scheme' | 'host' | 'port' | 'path'>;

const DEFAULT_PORTS: Record<string, number> = { http: 80, https: 443 };

/** `scheme://host[:port]path`, the port only when it is not the scheme's default */
export function requestUrl({ scheme, host, port, path }: Target): string {
  const portPart = DEFAULT_PORTS[scheme] === port ? '' : `:${port}`;
  return `${scheme}://${host}${portPart}${path ?? ''}`;
}

/** A null method is an HTTPS CONNECT tunnel the proxy did not open */
export const displayMethod = (method: string | null) => method ?? 'CONNECT';

export const isTunnel = (request: Pick<Request, 'method'>) =>
  request.method === null;

/**
 * The Name column, as DevTools shows it: the last path segment with its
 * query (`/` for the root), or `host:port` for a tunnel, which has no path.
 */
export function requestName(
  request: Pick<Request, 'method' | 'host' | 'port' | 'path'>,
): string {
  if (isTunnel(request)) return `${request.host}:${request.port}`;
  const path = request.path ?? '/';
  const queryAt = path.indexOf('?');
  const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
  const query = queryAt === -1 ? '' : path.slice(queryAt);
  const segment = pathname.split('/').filter(Boolean).pop();
  return `${segment ?? '/'}${query}`;
}

/** Blocked by the egress policy, failed upstream, or answered with >= 400 */
export function isErrorRequest(
  request: Pick<Request, 'outcome' | 'statusCode'>,
): boolean {
  return (
    request.outcome === 'denied' ||
    request.outcome === 'upstream_error' ||
    (request.statusCode ?? 0) >= 400
  );
}

/** What the Status column shows when there is no code to show */
export type StatusText =
  | { kind: 'code'; code: number }
  | { kind: 'blocked' | 'failed' | 'cancelled' | 'tunnel' };

export function statusText(
  request: Pick<Request, 'outcome' | 'statusCode'>,
): StatusText {
  if (request.outcome === 'denied') return { kind: 'blocked' };
  if (request.outcome === 'upstream_error') return { kind: 'failed' };
  if (request.statusCode !== null) return { kind: 'code', code: request.statusCode };
  if (request.outcome === 'cancelled') return { kind: 'cancelled' };
  return { kind: 'tunnel' };
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Decoded size of a base64 string, without decoding it */
export function base64Size(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

/** Where a request's bar sits in the Waterfall column, in % of its width */
export interface WaterfallBar {
  left: number;
  width: number;
}

/** Thinnest bar, so an instant request still shows */
const MIN_BAR = 0.75;

/**
 * Places each request on one time axis, from the earliest send to the latest
 * completion among `requests`, as DevTools does for the rows it shows.
 */
export function waterfall(
  requests: Pick<Request, 'id' | 'sentAt' | 'durationMs'>[],
): Map<string, WaterfallBar> {
  const bars = new Map<string, WaterfallBar>();
  if (requests.length === 0) return bars;
  const spans = requests.map((r) => {
    const start = Date.parse(r.sentAt);
    return { id: r.id, start, end: start + Math.max(0, r.durationMs) };
  });
  const first = Math.min(...spans.map((s) => s.start));
  const last = Math.max(...spans.map((s) => s.end));
  const total = Math.max(1, last - first);
  for (const { id, start, end } of spans) {
    const left = ((start - first) / total) * 100;
    const width = Math.max(MIN_BAR, ((end - start) / total) * 100);
    bars.set(id, { left: Math.min(left, 100 - width), width });
  }
  return bars;
}
