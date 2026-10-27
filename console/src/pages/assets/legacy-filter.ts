import type { Filter, FilterCondition } from '@/components/filter-builder/filter-model';

const LEGACY: Record<string, string> = {
  hosts: 'host', ports: 'port', ipAddresses: 'ip', techs: 'tech', urls: 'url', statusCodes: 'statusCode', tlsHosts: 'tlsHost',
};
export const LEGACY_FILTER_KEYS = [...Object.keys(LEGACY), 'isNew'];

export function legacyToFilter(search: Record<string, unknown>): Filter | undefined {
  const items: FilterCondition[] = Object.entries(LEGACY).flatMap(([key, field]) => {
    const raw = search[key];
    const value = (Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' || typeof raw === 'number' ? String(raw).split(',') : [])
      .filter(Boolean);
    return value.length ? [{ field, op: 'in' as const, value }] : [];
  });
  // Notification links say `?isNew=true`; the router parses it to a boolean.
  if (search.isNew === true || search.isNew === 'true') items.push({ field: 'isNew', op: 'eq', value: 'true' });
  return items.length ? { logic: 'and', items } : undefined;
}
