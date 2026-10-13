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
  url: ['eq', 'contains', 'notContains'],
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
  if (extra !== undefined || !prefix || !/^\d{1,3}$/.test(prefix)) return false;
  const version = isIP(addr, 4) ? 32 : isIP(addr, 6) ? 128 : 0;
  return version > 0 && Number(prefix) <= version;
}

function checkValue(field: AssetFilterField, op: AssetFilterOp, v: string): boolean {
  if (op === 'inSubnet') return isCidr(v);
  switch (field) {
    case 'ip': return isIP(v);
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
