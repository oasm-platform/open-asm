import type { BadgeProps } from '@/components/ui/badge';
import type { AgentHttpRequestListItemDto } from '@/services/apis/gen/queries';

type Target = Pick<AgentHttpRequestListItemDto, 'scheme' | 'host' | 'port' | 'path'>;

const DEFAULT_PORTS: Record<string, number> = { http: 80, https: 443 };

/** `scheme://host[:port]path`, the port only when it is not the scheme's default */
export function requestUrl({ scheme, host, port, path }: Target): string {
  const portPart = DEFAULT_PORTS[scheme] === port ? '' : `:${port}`;
  return `${scheme}://${host}${portPart}${path ?? ''}`;
}

/** A null method is an HTTPS CONNECT tunnel the proxy did not open */
export const displayMethod = (method: string | null) => method ?? 'CONNECT';

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function statusVariant(code: number): BadgeProps['variant'] {
  if (code >= 500) return 'destructive';
  if (code >= 400) return 'warning';
  if (code >= 300) return 'soft';
  return 'success';
}

export function outcomeVariant(
  outcome: AgentHttpRequestListItemDto['outcome'],
): BadgeProps['variant'] {
  return outcome === 'cancelled' ? 'secondary' : 'destructive';
}

/** Decoded size of a base64 string, without decoding it */
export function base64Size(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}
