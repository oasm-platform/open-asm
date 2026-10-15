import { isIP, isUUID } from 'class-validator';
import {
  compileFilter,
  IsFilterTree,
  validateFilter,
  type FilterCondition,
  type FilterFieldSpec,
  type FilterGroup,
  type FilterLogic,
  type FilterOp,
  type FilterSchema,
  type FilterTree,
} from '@/common/utils/filter-tree';

export { parseFilterParam } from '@/common/utils/filter-tree';

export type AssetFilterField =
  | 'host' | 'port' | 'ip' | 'tech' | 'url' | 'statusCode' | 'tlsHost' | 'tag' | 'assetGroup';
export type AssetFilterOp = FilterOp;
export type AssetFilterLogic = FilterLogic;
export type AssetFilterCondition = FilterCondition<AssetFilterField>;
export type AssetFilterGroup = FilterGroup<AssetFilterField>;
export type AssetFilter = FilterTree<AssetFilterField>;

function isCidr(v: string): boolean {
  const [addr, prefix, extra] = v.split('/');
  if (extra !== undefined || !prefix || !/^\d{1,3}$/.test(prefix) || addr.includes('%')) return false;
  const version = isIP(addr, 4) ? 32 : isIP(addr, 6) ? 128 : 0;
  return version > 0 && Number(prefix) <= version;
}

const OPS: Record<AssetFilterField, readonly FilterOp[]> = {
  host: ['eq', 'neq', 'contains', 'notContains', 'in', 'notIn'],
  port: ['eq', 'neq', 'in', 'notIn'],
  ip: ['eq', 'neq', 'in', 'notIn', 'inSubnet'],
  tech: ['eq', 'neq', 'contains', 'in', 'notIn'],
  url: ['eq', 'contains', 'notContains', 'in', 'notIn'],
  statusCode: ['eq', 'neq', 'in', 'notIn'],
  tlsHost: ['eq', 'neq', 'contains', 'in'],
  tag: ['eq', 'neq', 'contains', 'in', 'notIn'],
  assetGroup: ['eq', 'neq', 'in', 'notIn'],
};

const CHECKS: Partial<Record<AssetFilterField, FilterFieldSpec['check']>> = {
  ip: (v, op) => (op === 'inSubnet' ? isCidr(v) : isIP(v) && !v.includes('%')), // inet rejects zone ids -> would be a 500
  port: (v) => /^\d{1,5}$/.test(v) && Number(v) <= 65535,
  statusCode: (v) => /^\d{3}$/.test(v),
  assetGroup: (v) => isUUID(v),
};

const FIELD_SQL: Record<AssetFilterField, Pick<FilterFieldSpec, 'any' | 'like' | 'subnet'>> = {
  host: {
    any: (p) => `asset.value = ANY(${p})`,
    like: (p) => `asset.value ILIKE ${p}`,
  },
  port: { any: (p) => `asset_service.port = ANY(${p})` },
  ip: {
    // Asset IPs = its DNS A/AAAA records (same source as the IP tab).
    any: (p) => `EXISTS (SELECT 1 FROM ip_observations io WHERE io."assetId" = asset.id AND io.source IN ('dns_a', 'dns_aaaa') AND io."ip" = ANY(CAST(${p} AS inet[])))`,
    subnet: (p) => `EXISTS (SELECT 1 FROM ip_observations io WHERE io."assetId" = asset.id AND io.source IN ('dns_a', 'dns_aaaa') AND io."ip" <<= ANY(CAST(${p} AS inet[])))`,
  },
  tech: {
    // Match the full "name:version" string when the value carries a version, else the bare name.
    any: (p) => `EXISTS (SELECT 1 FROM http_response_technologies hrt WHERE hrt."httpResponseId" = latest_http_response.id AND (hrt.name = ANY(${p}) OR (hrt.name || ':' || hrt.version) = ANY(${p})))`,
    like: (p) => `EXISTS (SELECT 1 FROM http_response_technologies hrt WHERE hrt."httpResponseId" = latest_http_response.id AND hrt.name ILIKE ${p})`,
  },
  url: {
    any: (p) => `EXISTS (SELECT 1 FROM discovered_urls du WHERE du."assetServiceId" = asset_service.id AND du.url = ANY(${p}))`,
    like: (p) => `EXISTS (SELECT 1 FROM discovered_urls du WHERE du."assetServiceId" = asset_service.id AND du.url ILIKE ${p})`,
  },
  statusCode: {
    any: (p) => `EXISTS (SELECT 1 FROM http_status_codes hsc WHERE hsc."httpResponseId" = latest_http_response.id AND hsc."statusCode" = ANY(${p}))`,
  },
  tlsHost: {
    any: (p) => `EXISTS (SELECT 1 FROM tls_certificates tc WHERE tc."httpResponseId" = latest_http_response.id AND tc."host" = ANY(${p}))`,
    like: (p) => `EXISTS (SELECT 1 FROM tls_certificates tc WHERE tc."httpResponseId" = latest_http_response.id AND tc."host" ILIKE ${p})`,
  },
  tag: {
    any: (p) => `EXISTS (SELECT 1 FROM asset_services_tags ast WHERE ast."assetServiceId" = asset_service.id AND ast.tag = ANY(${p}))`,
    like: (p) => `EXISTS (SELECT 1 FROM asset_services_tags ast WHERE ast."assetServiceId" = asset_service.id AND ast.tag ILIKE ${p})`,
  },
  assetGroup: {
    any: (p) => `EXISTS (SELECT 1 FROM assets_group_assets aga WHERE aga."assetId" = asset.id AND aga."assetGroupId" = ANY(CAST(${p} AS uuid[])))`,
  },
};

export const ASSET_FILTER_SCHEMA = Object.fromEntries(
  (Object.keys(OPS) as AssetFilterField[]).map((f) => [f, { ops: OPS[f], check: CHECKS[f], ...FIELD_SQL[f] }]),
) as FilterSchema<AssetFilterField>;

export const validateAssetFilter = (input: unknown) => validateFilter(ASSET_FILTER_SCHEMA, input);
export const IsAssetFilter = () => IsFilterTree(ASSET_FILTER_SCHEMA);
export const compileAssetFilter = (filter: AssetFilter, prefix: string) =>
  compileFilter(ASSET_FILTER_SCHEMA, filter, prefix);

const LEGACY_KEYS = {
  hosts: 'host',
  ports: 'port',
  ipAddresses: 'ip',
  techs: 'tech',
  urls: 'url',
  statusCodes: 'statusCode',
  tlsHosts: 'tlsHost',
} as const satisfies Record<string, AssetFilterField>;

export function legacyParamsToFilter(
  q: Partial<Record<keyof typeof LEGACY_KEYS, string[]>>,
): AssetFilter | undefined {
  const items = Object.entries(LEGACY_KEYS)
    .filter(([key]) => q[key as keyof typeof LEGACY_KEYS]?.length)
    .map(([key, field]) => ({ field, op: 'in' as const, value: q[key as keyof typeof LEGACY_KEYS]! }));
  return items.length ? { logic: 'and', items } : undefined;
}
