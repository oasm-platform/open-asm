import { registerDecorator } from 'class-validator';

// Generic JSON filter tree: {"logic","items":[condition | {"logic","conditions":[condition]}]}.
// Each module supplies a FilterSchema (allowed ops, value check and SQL per field).
export type FilterOp =
  | 'eq' | 'neq' | 'contains' | 'notContains' | 'in' | 'notIn' | 'inSubnet'
  | 'gt' | 'gte' | 'lt' | 'lte';
export type FilterLogic = 'and' | 'or';

export interface FilterCondition<F extends string = string> {
  field: F;
  op: FilterOp;
  value: string | string[];
}
export interface FilterGroup<F extends string = string> {
  logic: FilterLogic;
  conditions: FilterCondition<F>[];
}
export interface FilterTree<F extends string = string> {
  logic: FilterLogic;
  items: Array<FilterCondition<F> | FilterGroup<F>>;
}

type Fragment = (p: string) => string;
type CmpOp = '>' | '>=' | '<' | '<=';
export interface FilterFieldSpec {
  ops: readonly FilterOp[];
  // Returns false to reject a value; invalid values would otherwise be a 500 (bad casts).
  check?: (v: string, op: FilterOp) => boolean;
  /** "matches any of :p" (p is a text[] param) */
  any: Fragment;
  /** ILIKE :p, required when contains/notContains is allowed */
  like?: Fragment;
  /** inet containment, required when inSubnet is allowed */
  subnet?: Fragment;
  /** numeric comparison, required when gt/gte/lt/lte is allowed */
  cmp?: (p: string, op: CmpOp) => string;
}
export type FilterSchema<F extends string> = Record<F, FilterFieldSpec>;

export const LIST_OPS: ReadonlySet<FilterOp> = new Set(['in', 'notIn', 'inSubnet']);
export const FILTER_LIMITS = { conditions: 20, values: 50, length: 255 } as const;
const CMP: Partial<Record<FilterOp, CmpOp>> = { gt: '>', gte: '>=', lt: '<', lte: '<=' };

const LOGICS = new Set(['and', 'or']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function validateCondition(schema: FilterSchema<string>, c: unknown, path: string): string | null {
  if (!isObject(c)) return `${path} must be an object`;
  const field = c.field as string;
  const op = c.op as FilterOp;
  if (!(typeof field === 'string' && Object.prototype.hasOwnProperty.call(schema, field))) return `${path}.field is not a filterable field`;
  const spec = schema[field];
  if (!spec.ops.includes(op)) return `${path}.op "${String(op)}" is not allowed for ${field}`;
  const isList = LIST_OPS.has(op);
  if (isList !== Array.isArray(c.value)) return `${path}.value must be ${isList ? 'an array' : 'a string'}`;
  const values = (isList ? c.value : [c.value]) as unknown[];
  if (values.length === 0) return `${path}.value must not be empty`;
  if (values.length > FILTER_LIMITS.values) return `${path}.value has more than ${FILTER_LIMITS.values} values`;
  for (const v of values) {
    if (typeof v !== 'string' || v.length === 0 || v.length > FILTER_LIMITS.length)
      return `${path}.value entries must be 1-${FILTER_LIMITS.length} character strings`;
    if (v.includes('\u0000')) return `${path}.value must not contain NUL characters`;
    if (spec.check && !spec.check(v, op)) return `${path}.value "${v}" is not a valid ${op === 'inSubnet' ? 'CIDR' : field}`;
  }
  return null;
}

export function validateFilter(schema: FilterSchema<string>, input: unknown): string | null {
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
        const err = validateCondition(schema, c, `${path}.conditions[${j}]`);
        if (err) return err;
        count++;
      }
    } else {
      const err = validateCondition(schema, item, path);
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

export function IsFilterTree(schema: FilterSchema<string>): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isFilterTree',
      target: target.constructor,
      propertyName: propertyName as string,
      validator: {
        validate: (value: unknown) => validateFilter(schema, value) === null,
        defaultMessage: (args) => `filter: ${validateFilter(schema, args?.value) ?? 'invalid'}`,
      },
    });
  };
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Compiles a validated tree to one WHERE fragment; values only ever go into params. */
export function compileFilter<F extends string>(
  schema: FilterSchema<F>,
  filter: FilterTree<F>,
  prefix: string,
): { sql: string; params: Record<string, unknown> } | null {
  const params: Record<string, unknown> = {};
  const compileCondition = ({ field, op, value }: FilterCondition<F>): string => {
    const name = `${prefix}${Object.keys(params).length}`;
    const p = `:${name}`;
    const sql = schema[field];
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
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        params[name] = value;
        return `(${sql.cmp!(p, CMP[op]!)})`;
    }
  };
  const join = (logic: FilterLogic, parts: string[]) =>
    `(${parts.join(logic === 'or' ? ' OR ' : ' AND ')})`;

  const parts = filter.items.map((item) =>
    'conditions' in item ? join(item.logic, item.conditions.map(compileCondition)) : compileCondition(item),
  );
  return parts.length ? { sql: join(filter.logic, parts), params } : null;
}
