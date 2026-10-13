import type { FilterFieldConfig, FilterOp, FilterSuggestion } from '@/components/filter-builder/filter-model';
import {
  type GetManyAssetGroupDto, type GetManyGetHostAssetsDTODto, type GetManyGetIpAssetsDTODto, type GetManyGetPortAssetsDTODto,
  type GetManyGetStatusCodeAssetsDTODto, type GetManyGetTagAssetsDTODto, type GetManyGetTechnologyAssetsDTODto,
  type GetManyGetTlsResponseDtoDto, type GetManyGetUrlAssetsDTODto,
  useAssetGroupControllerGetAll, useAssetsControllerGetHostAssets, useAssetsControllerGetIpAssets,
  useAssetsControllerGetPortAssets, useAssetsControllerGetStatusCodeAssets, useAssetsControllerGetTagAssets,
  useAssetsControllerGetTechnologyAssets, useAssetsControllerGetTlsAssets, useAssetsControllerGetUrlAssets,
} from '@/services/apis/gen/queries';
import { useAsset } from './context/asset-context';

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
// shortcut: loose IPv6 shape check; the server's isIP is authoritative and returns 400 on a miss.
const IPV6 = /^[0-9a-f:]+(:\d{1,3}(\.\d{1,3}){3})?$/i;
const isIp = (v: string) => IPV4.test(v) || (v.includes(':') && IPV6.test(v));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isCidr = (v: string) => {
  const [addr, prefix, extra] = v.split('/');
  if (extra !== undefined || !/^\d{1,3}$/.test(prefix ?? '')) return false;
  const max = IPV4.test(addr) ? 32 : isIp(addr) ? 128 : 0;
  return max > 0 && Number(prefix) <= max;
};

// Suggestions are scoped by target + typed text only (not the applied filter,
// which would hide every value not already selected).
function useScope(search: string) {
  const { targetId } = useAsset();
  return { targetIds: targetId ? [targetId] : undefined, value: search || undefined, limit: 20, page: 1 };
}
const opts = <T,>(enabled: boolean, select: (d: T) => FilterSuggestion[]) => ({ query: { enabled, select } });
const toOptions = (values: Array<string | number | undefined | null>): FilterSuggestion[] =>
  [...new Set(values.filter((v) => v !== undefined && v !== null && v !== '').map(String))].map((v) => ({ value: v, label: v }));

const wrap = (r: { data?: FilterSuggestion[]; isFetching: boolean }) => ({ options: r.data ?? [], isFetching: r.isFetching });

export const ASSET_FILTER_FIELDS: FilterFieldConfig[] = [
  { key: 'host', label: 'Host', operators: ['eq', 'neq', 'contains', 'notContains', 'in', 'notIn'],
    useSuggestions: (s, on) => wrap(useAssetsControllerGetHostAssets(useScope(s), opts(on, (d: GetManyGetHostAssetsDTODto) => toOptions(d.data.map((e) => e.host))))) },
  { key: 'port', label: 'Port', operators: ['eq', 'neq', 'in', 'notIn'],
    useSuggestions: (s, on) => wrap(useAssetsControllerGetPortAssets(useScope(s), opts(on, (d: GetManyGetPortAssetsDTODto) => toOptions(d.data.map((e) => e.port))))),
    validate: (v) => (/^\d{1,5}$/.test(v) && Number(v) <= 65535 ? null : 'Port must be 0-65535') },
  { key: 'ip', label: 'IP', operators: ['eq', 'neq', 'in', 'notIn', 'inSubnet'],
    useSuggestions: (s, on) => wrap(useAssetsControllerGetIpAssets(useScope(s), opts(on, (d: GetManyGetIpAssetsDTODto) => toOptions(d.data.map((e) => e.ip))))),
    validate: (v, op: FilterOp) => (op === 'inSubnet' ? (isCidr(v) ? null : `"${v}" is not a valid CIDR`) : isIp(v) ? null : `"${v}" is not a valid IP`) },
  { key: 'tech', label: 'Technology', operators: ['eq', 'neq', 'contains', 'in', 'notIn'],
    useSuggestions: (s, on) => wrap(useAssetsControllerGetTechnologyAssets(useScope(s), opts(on, (d: GetManyGetTechnologyAssetsDTODto) => toOptions(d.data.map((e) => e.technology.name))))) },
  { key: 'url', label: 'URL', operators: ['eq', 'contains', 'notContains', 'in', 'notIn'],
    useSuggestions: (s, on) => wrap(useAssetsControllerGetUrlAssets(useScope(s), opts(on, (d: GetManyGetUrlAssetsDTODto) => toOptions(d.data.map((e) => e.url))))) },
  { key: 'statusCode', label: 'Status code', operators: ['eq', 'neq', 'in', 'notIn'],
    useSuggestions: (s, on) => wrap(useAssetsControllerGetStatusCodeAssets(useScope(s), opts(on, (d: GetManyGetStatusCodeAssetsDTODto) => toOptions(d.data.map((e) => e.statusCode))))),
    validate: (v) => (/^\d{3}$/.test(v) ? null : 'Status code must be 3 digits') },
  { key: 'tlsHost', label: 'TLS host', operators: ['eq', 'neq', 'contains', 'in'],
    useSuggestions: (s, on) => {
      const { targetIds, limit, page } = useScope(s);
      return wrap(useAssetsControllerGetTlsAssets({ targetIds, limit, page, search: s || undefined }, opts(on, (d: GetManyGetTlsResponseDtoDto) => toOptions(d.data.map((e) => e.host)))));
    } },
  { key: 'tag', label: 'Tag', operators: ['eq', 'neq', 'contains', 'in', 'notIn'],
    useSuggestions: (s, on) => wrap(useAssetsControllerGetTagAssets({ ...useScope(s), sortBy: 'assetCount', sortOrder: 'DESC' }, opts(on, (d: GetManyGetTagAssetsDTODto) => toOptions(d.data.map((e) => e.tag))))) },
  { key: 'assetGroup', label: 'Asset group', operators: ['eq', 'neq', 'in', 'notIn'],
    validate: (v) => (UUID.test(v) ? null : 'Pick a group from the list'),
    useSuggestions: (s, on) => {
      const { targetIds, limit, page } = useScope(s);
      return wrap(useAssetGroupControllerGetAll({ targetIds, limit, page, search: s || undefined },
        opts(on, (d: GetManyAssetGroupDto) => d.data.map((g) => ({ value: g.id, label: g.name })))));
    } },
];
