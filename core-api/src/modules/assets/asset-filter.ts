import { isIP, isUUID, registerDecorator } from 'class-validator';

export type AssetFilterField =
  | 'host' | 'port' | 'ip' | 'tech' | 'url' | 'statusCode' | 'tlsHost' | 'tag' | 'assetGroup';
export type AssetFilterOp =
  | 'eq' | 'neq' | 'contains' | 'notContains' | 'in' | 'notIn' | 'inSubnet';
export type AssetFilterLogic = 'and' | 'or';

export interface AssetFilterCondition {
  field: AssetFilterField;
  op: AssetFilterOp;
  value: string | string[];
}
export interface AssetFilterGroup {
  logic: AssetFilterLogic;
  conditions: AssetFilterCondition[];
}
export interface AssetFilter {
  logic: AssetFilterLogic;
  items: Array<AssetFilterCondition | AssetFilterGroup>;
}

export const FIELD_OPS: Record<AssetFilterField, readonly AssetFilterOp[]> = {
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

export const LIST_OPS: ReadonlySet<AssetFilterOp> = new Set(['in', 'notIn', 'inSubnet']);
export const FILTER_LIMITS = { conditions: 20, values: 50, length: 255 } as const;

const LOGICS = new Set(['and', 'or']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function isCidr(v: string): boolean {
  const [addr, prefix, extra] = v.split('/');
  if (extra !== undefined || !prefix || !/^\d{1,3}$/.test(prefix) || addr.includes('%')) return false;
  const version = isIP(addr, 4) ? 32 : isIP(addr, 6) ? 128 : 0;
  return version > 0 && Number(prefix) <= version;
}

function checkValue(field: AssetFilterField, op: AssetFilterOp, v: string): boolean {
  if (op === 'inSubnet') return isCidr(v);
  switch (field) {
    case 'ip': return isIP(v) && !v.includes('%'); // inet rejects zone ids -> would be a 500
    case 'port': return /^\d{1,5}$/.test(v) && Number(v) <= 65535;
    case 'statusCode': return /^\d{3}$/.test(v);
    case 'assetGroup': return isUUID(v);
    default: return true;
  }
}

function validateCondition(c: unknown, path: string): string | null {
  if (!isObject(c)) return `${path} must be an object`;
  const field = c.field as AssetFilterField;
  const op = c.op as AssetFilterOp;
  if (!(typeof field === 'string' && Object.prototype.hasOwnProperty.call(FIELD_OPS, field))) return `${path}.field is not a filterable field`;
  if (!FIELD_OPS[field].includes(op)) return `${path}.op "${String(op)}" is not allowed for ${field}`;
  const isList = LIST_OPS.has(op);
  if (isList !== Array.isArray(c.value)) return `${path}.value must be ${isList ? 'an array' : 'a string'}`;
  const values = (isList ? c.value : [c.value]) as unknown[];
  if (values.length === 0) return `${path}.value must not be empty`;
  if (values.length > FILTER_LIMITS.values) return `${path}.value has more than ${FILTER_LIMITS.values} values`;
  for (const v of values) {
    if (typeof v !== 'string' || v.length === 0 || v.length > FILTER_LIMITS.length)
      return `${path}.value entries must be 1-${FILTER_LIMITS.length} character strings`;
    if (v.includes('\u0000')) return `${path}.value must not contain NUL characters`;
    if (!checkValue(field, op, v)) return `${path}.value "${v}" is not a valid ${op === 'inSubnet' ? 'CIDR' : field}`;
  }
  return null;
}

export function validateAssetFilter(input: unknown): string | null {
  if (!isObject(input) || !LOGICS.has(input.logic as string) || !Array.isArray(input.items))
    return 'filter must be {"logic":"and"|"or","items":[...]}';
  let count = 0;
  for (const [i, item] of input.items.entries()) {
    const path = `items[${i}]`;
    if (isObject(item) && 'conditions' in item) {
      if (!LOGICS.has(item.logic as string) || !Array.isArray(item.conditions) || item.conditions.length === 0)
        return `${path} must be a non-empty {"logic","conditions"} group`;
      for (const [j, c] of item.conditions.entries()) {
        if (isObject(c) && 'conditions' in c) return `${path}.conditions[${j}] groups cannot be nested`;
        const err = validateCondition(c, `${path}.conditions[${j}]`);
        if (err) return err;
        count++;
      }
    } else {
      const err = validateCondition(item, path);
      if (err) return err;
      count++;
    }
    if (count > FILTER_LIMITS.conditions) return `filter has more than ${FILTER_LIMITS.conditions} conditions`;
  }
  return null;
}

export function parseFilterParam(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function IsAssetFilter(): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isAssetFilter',
      target: target.constructor,
      propertyName: propertyName as string,
      validator: {
        validate: (value: unknown) => validateAssetFilter(value) === null,
        defaultMessage: (args) => `filter: ${validateAssetFilter(args?.value) ?? 'invalid'}`,
      },
    });
  };
}

type Fragment = (p: string) => string;

// One "matches any of :p" fragment per field (moved from the old whereBuilder),
// plus an ILIKE fragment where `contains` is allowed and the subnet fragment for ip.
const FIELD_SQL: Record<AssetFilterField, { any: Fragment; like?: Fragment; subnet?: Fragment }> = {
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

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

export function compileAssetFilter(
  filter: AssetFilter,
  prefix: string,
): { sql: string; params: Record<string, unknown> } | null {
  const params: Record<string, unknown> = {};
  const compileCondition = ({ field, op, value }: AssetFilterCondition): string => {
    const name = `${prefix}${Object.keys(params).length}`;
    const p = `:${name}`;
    const sql = FIELD_SQL[field];
    switch (op) {
      case 'eq':
      case 'neq':
      case 'in':
      case 'notIn':
        params[name] = Array.isArray(value) ? value : [value];
        return op === 'eq' || op === 'in' ? `(${sql.any(p)})` : `NOT (${sql.any(p)})`;
      case 'contains':
      case 'notContains':
        params[name] = `%${escapeLike(value as string)}%`;
        return op === 'contains' ? `(${sql.like!(p)})` : `NOT (${sql.like!(p)})`;
      case 'inSubnet':
        params[name] = value;
        return `(${sql.subnet!(p)})`;
    }
  };
  const join = (logic: AssetFilterLogic, parts: string[]) =>
    `(${parts.join(logic === 'or' ? ' OR ' : ' AND ')})`;

  const parts = filter.items.map((item) =>
    'conditions' in item ? join(item.logic, item.conditions.map(compileCondition)) : compileCondition(item),
  );
  return parts.length ? { sql: join(filter.logic, parts), params } : null;
}

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
