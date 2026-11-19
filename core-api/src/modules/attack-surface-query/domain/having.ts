import { typeCheck } from '../catalog/catalog';
import type { FieldType } from '../catalog/catalog.types';
import type { AsqIssueCode } from './query-errors';
import type { HavingNode, HavingOp, NormalizedAggregate, NormalizedGroup } from './query.types';
import { parseTimeExpr } from './time-window';
import { WHERE_VALUE_LENGTH, type WhereLimits } from './where';

const HAVING_OPS: readonly HavingOp[] = ['eq', 'neq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte'];
const LIST_OPS = new Set<HavingOp>(['in', 'notIn']);
const ORDERED_TYPES = new Set<FieldType>(['int', 'float', 'timestamp']);

/** Type of the value an aggregate produces. */
export function aggregateType(agg: NormalizedAggregate): FieldType {
  switch (agg.fn) {
    case 'count':
    case 'countDistinct':
      return 'int';
    case 'sum':
    case 'avg':
      return 'float';
    default:
      return agg.path!.field.type;
  }
}

export interface HavingContext {
  now: Date;
  limits: WhereLimits;
  groupBy: readonly NormalizedGroup[];
  aggregate: readonly NormalizedAggregate[];
  issue: (path: string, code: AsqIssueCode, message: string) => void;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates a `having` tree: same shape as `where` (groups, `not`), but its
 * fields are the query's group keys and aggregate names.
 */
export function normalizeHaving(ctx: HavingContext, input: unknown, at: string): HavingNode | undefined {
  let conditions = 0;
  const names = [...ctx.groupBy.map((g) => g.key), ...ctx.aggregate.map((a) => a.alias)];

  const condition = (c: Record<string, unknown>, here: string): HavingNode | undefined => {
    conditions++;
    if (conditions === ctx.limits.conditions + 1) {
      ctx.issue(here, 'LIMIT_EXCEEDED', `having holds at most ${ctx.limits.conditions} conditions`);
    }
    const extra = Object.keys(c).filter((k) => !['field', 'op', 'value'].includes(k));
    if (extra.length) ctx.issue(here, 'INVALID_SHAPE', `unknown key(s): ${extra.join(', ')}`);
    const groupIndex = ctx.groupBy.findIndex((g) => g.key === c.field);
    const aggIndex = ctx.aggregate.findIndex((a) => a.alias === c.field);
    if (groupIndex < 0 && aggIndex < 0) {
      ctx.issue(`${here}.field`, 'UNKNOWN_FIELD', `having tests a group key or an aggregate name (${names.join(', ')})`);
      return undefined;
    }
    const ref = groupIndex >= 0 ? { kind: 'group' as const, index: groupIndex } : { kind: 'aggregate' as const, index: aggIndex };
    const type: FieldType = groupIndex >= 0 ? ctx.groupBy[groupIndex].path.field.type : aggregateType(ctx.aggregate[aggIndex]);
    const enumValues = groupIndex >= 0 ? ctx.groupBy[groupIndex].path.field.enumValues : undefined;
    const op = c.op as HavingOp;
    if (!HAVING_OPS.includes(op) || (['gt', 'gte', 'lt', 'lte'].includes(op) && !ORDERED_TYPES.has(type))) {
      ctx.issue(`${here}.op`, 'OP_NOT_ALLOWED', `op "${String(c.op)}" is not allowed for ${String(c.field)}`);
      return undefined;
    }
    const isList = LIST_OPS.has(op);
    if (isList !== Array.isArray(c.value)) {
      ctx.issue(`${here}.value`, 'INVALID_VALUE', `value must be ${isList ? 'an array' : 'a string'}`);
      return undefined;
    }
    const raw = (isList ? c.value : [c.value]) as unknown[];
    if (raw.length === 0 || raw.length > ctx.limits.values) {
      ctx.issue(`${here}.value`, 'INVALID_VALUE', `value must hold 1-${ctx.limits.values} entries`);
      return undefined;
    }
    const values: string[] = [];
    for (const v of raw) {
      if (typeof v !== 'string' || v.length === 0 || v.length > WHERE_VALUE_LENGTH || v.includes('\u0000')) {
        ctx.issue(`${here}.value`, 'INVALID_VALUE', `value entries must be 1-${WHERE_VALUE_LENGTH} character strings`);
        return undefined;
      }
      let value = v;
      if (type === 'timestamp') {
        const parsed = parseTimeExpr(v, ctx.now, { allowFuture: true });
        if (!parsed.ok) {
          ctx.issue(`${here}.value`, 'INVALID_TIME', parsed.message);
          return undefined;
        }
        value = parsed.value.toISOString();
      }
      if (!typeCheck(type, value, op) || (enumValues && !enumValues.includes(value))) {
        ctx.issue(`${here}.value`, 'INVALID_VALUE', `"${v}" is not a valid ${String(c.field)}`);
        return undefined;
      }
      values.push(value);
    }
    return { kind: 'cond', ref, op, values, type };
  };

  const node = (n: unknown, here: string, depth: number, notChain: number): HavingNode | undefined => {
    if (!isObject(n)) {
      ctx.issue(here, 'INVALID_SHAPE', 'must be an object');
      return undefined;
    }
    if ('logic' in n) {
      if (depth > ctx.limits.depth) {
        ctx.issue(here, 'LIMIT_EXCEEDED', `groups nest at most ${ctx.limits.depth} levels`);
        return undefined;
      }
      if ((n.logic !== 'and' && n.logic !== 'or') || !Array.isArray(n.items) || (depth > 1 && n.items.length === 0)) {
        ctx.issue(here, 'INVALID_SHAPE', 'must be a non-empty {"logic":"and"|"or","items":[...]}');
        return undefined;
      }
      const items = n.items.map((item, i) => node(item, `${here}.items[${i}]`, depth + 1, 0));
      return items.every((i) => i !== undefined) ? { kind: 'group', logic: n.logic, items: items as HavingNode[] } : undefined;
    }
    if ('not' in n) {
      if (notChain >= 8) {
        ctx.issue(here, 'LIMIT_EXCEEDED', 'at most 8 nested "not"');
        return undefined;
      }
      const item = node(n.not, `${here}.not`, depth, notChain + 1);
      return item && { kind: 'not', item };
    }
    return condition(n, here);
  };

  return node(input, at, 1, 0);
}
