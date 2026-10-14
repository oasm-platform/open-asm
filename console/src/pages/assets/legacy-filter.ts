import type { Filter } from '@/components/filter-builder/filter-model';

const LEGACY: Record<string, string> = {
  hosts: 'host', ports: 'port', ipAddresses: 'ip', techs: 'tech', urls: 'url', statusCodes: 'statusCode', tlsHosts: 'tlsHost',
};
export const LEGACY_FILTER_KEYS = Object.keys(LEGACY);

export function legacyToFilter(search: Record<string, unknown>): Filter | undefined {
  const items = Object.entries(LEGACY).flatMap(([key, field]) => {
    const raw = search[key];
    const value = (Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' || typeof raw === 'number' ? String(raw).split(',') : [])
      .filter(Boolean);
    return value.length ? [{ field, op: 'in' as const, value }] : [];
  });
  return items.length ? { logic: 'and', items } : undefined;
}
