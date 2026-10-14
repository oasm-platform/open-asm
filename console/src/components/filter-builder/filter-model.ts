import { z } from 'zod';

export type FilterOp = 'eq' | 'neq' | 'contains' | 'notContains' | 'in' | 'notIn' | 'inSubnet';
export type FilterLogic = 'and' | 'or';
export interface FilterCondition { field: string; op: FilterOp; value: string | string[] }
export interface FilterGroup { logic: FilterLogic; conditions: FilterCondition[] }
export type FilterItem = FilterCondition | FilterGroup;
export interface Filter { logic: FilterLogic; items: FilterItem[] }
export interface FilterSuggestion { value: string; label: string }
export interface FilterFieldConfig {
  key: string;
  label: string;
  operators: FilterOp[];
  useSuggestions: (search: string, enabled: boolean) => { options: FilterSuggestion[]; isFetching: boolean };
  validate?: (value: string, op: FilterOp) => string | null;
}
export type Path = [number] | [number, number];

export const OP_LABELS: Record<FilterOp, string> = {
  eq: '=', neq: '!=', contains: 'contains', notContains: 'does not contain',
  in: 'in', notIn: 'not in', inSubnet: 'in subnet',
};
export const LIST_OPS: ReadonlySet<FilterOp> = new Set<FilterOp>(['in', 'notIn', 'inSubnet']);
// Mirrors core-api asset-filter.ts FILTER_LIMITS.
export const FILTER_LIMITS = { conditions: 20, values: 50, length: 255 } as const;

const logicSchema = z.enum(['and', 'or']);
const conditionSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'contains', 'notContains', 'in', 'notIn', 'inSubnet']),
  value: z.union([z.string(), z.array(z.string())]),
});
const filterSchema = z.object({
  logic: logicSchema,
  items: z.array(z.union([z.object({ logic: logicSchema, conditions: z.array(conditionSchema) }), conditionSchema])),
});

export const isGroup = (item: FilterItem): item is FilterGroup => 'conditions' in item;
const conditionsOf = (f: Filter) => f.items.flatMap((i) => (isGroup(i) ? i.conditions : [i]));
export const countConditions = (f?: Filter) => (f ? conditionsOf(f).length : 0);

export const encodeFilter = (f?: Filter) => (f && f.items.length ? JSON.stringify(f) : undefined);
export function decodeFilter(s?: string): Filter | undefined {
  if (!s) return undefined;
  try {
    const parsed = filterSchema.safeParse(JSON.parse(s));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const fieldOf = (key: string, fields: FilterFieldConfig[]) => fields.find((x) => x.key === key);
const blank = (field: FilterFieldConfig): FilterCondition => {
  const op = field.operators[0];
  return { field: field.key, op, value: LIST_OPS.has(op) ? [] : '' };
};
// Groups left with one condition become a plain condition; empty groups disappear.
const normalize = (items: FilterItem[]): FilterItem[] =>
  items.flatMap((i) => (isGroup(i) && i.conditions.length <= 1 ? i.conditions : [i]));

export function addCondition(f: Filter, fields: FilterFieldConfig[], groupIndex?: number): Filter {
  const c = blank(fields[0]);
  if (groupIndex === undefined) return { ...f, items: [...f.items, c] };
  return {
    ...f,
    items: f.items.map((i, idx) => (idx === groupIndex && isGroup(i) ? { ...i, conditions: [...i.conditions, c] } : i)),
  };
}

function convertValue(value: string | string[], toList: boolean): string | string[] {
  if (toList) return Array.isArray(value) ? value : value ? [value] : [];
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

export function updateCondition(f: Filter, path: Path, patch: Partial<FilterCondition>, fields: FilterFieldConfig[]): Filter {
  const apply = (c: FilterCondition): FilterCondition => {
    if (patch.field && patch.field !== c.field) {
      const field = fieldOf(patch.field, fields);
      return field ? blank(field) : c;
    }
    const next = { ...c, ...patch };
    if (patch.op && LIST_OPS.has(patch.op) !== LIST_OPS.has(c.op)) next.value = convertValue(c.value, LIST_OPS.has(patch.op));
    return next;
  };
  return {
    ...f,
    items: f.items.map((item, i) => {
      if (i !== path[0]) return item;
      if (path.length === 1) return isGroup(item) ? item : apply(item);
      return isGroup(item) ? { ...item, conditions: item.conditions.map((c, j) => (j === path[1] ? apply(c) : c)) } : item;
    }),
  };
}

export function removeCondition(f: Filter, path: Path): Filter {
  const items = f.items.flatMap((item, i) => {
    if (i !== path[0]) return [item];
    if (path.length === 1) return [];
    return isGroup(item) ? [{ ...item, conditions: item.conditions.filter((_, j) => j !== path[1]) }] : [item];
  });
  return { ...f, items: normalize(items) };
}

export function groupWithPrevious(f: Filter, index: number): Filter {
  const prev = f.items[index - 1];
  const cur = f.items[index];
  if (!prev || !cur || isGroup(cur)) return f;
  const group: FilterGroup = isGroup(prev)
    ? { ...prev, conditions: [...prev.conditions, cur] }
    : { logic: f.logic === 'and' ? 'or' : 'and', conditions: [prev, cur] };
  return { ...f, items: [...f.items.slice(0, index - 1), group, ...f.items.slice(index + 1)] };
}

export function ungroup(f: Filter, groupIndex: number, conditionIndex: number): Filter {
  const group = f.items[groupIndex];
  if (!group || !isGroup(group)) return f;
  const moved = group.conditions[conditionIndex];
  const rest = { ...group, conditions: group.conditions.filter((_, j) => j !== conditionIndex) };
  const items = [...f.items.slice(0, groupIndex), rest, moved, ...f.items.slice(groupIndex + 1)];
  return { ...f, items: normalize(items) };
}

const flip = (l: FilterLogic): FilterLogic => (l === 'and' ? 'or' : 'and');
export function toggleLogic(f: Filter, groupIndex?: number): Filter {
  if (groupIndex === undefined) return { ...f, logic: flip(f.logic) };
  return { ...f, items: f.items.map((i, idx) => (idx === groupIndex && isGroup(i) ? { ...i, logic: flip(i.logic) } : i)) };
}

export function conditionError(c: FilterCondition, fields: FilterFieldConfig[]): string | null {
  const field = fieldOf(c.field, fields);
  if (!field) return 'Unknown field';
  if (!field.operators.includes(c.op)) return 'Operator not supported';
  const values = Array.isArray(c.value) ? c.value : [c.value];
  if (values.length === 0 || values.some((v) => v.trim() === '')) return 'Value is required';
  if (values.length > FILTER_LIMITS.values) return `At most ${FILTER_LIMITS.values} values`;
  if (values.some((v) => v.length > FILTER_LIMITS.length)) return `Values must be at most ${FILTER_LIMITS.length} characters`;
  for (const v of values) {
    const err = field.validate?.(v, c.op);
    if (err) return err;
  }
  return null;
}

export function filterError(f: Filter, fields: FilterFieldConfig[]): string | null {
  const all = conditionsOf(f);
  if (all.length > FILTER_LIMITS.conditions) return `At most ${FILTER_LIMITS.conditions} conditions`;
  for (const c of all) {
    const err = conditionError(c, fields);
    if (err) return err;
  }
  return null;
}

const quote = (v: string) => JSON.stringify(v);
export function conditionToText(c: FilterCondition, fields: FilterFieldConfig[]): string {
  const label = fieldOf(c.field, fields)?.label ?? c.field;
  const value = Array.isArray(c.value) ? `[${c.value.map(quote).join(', ')}]` : quote(c.value);
  return `${label} ${OP_LABELS[c.op]} ${value}`;
}

export function filterToText(f: Filter, fields: FilterFieldConfig[]): string {
  const sep = (l: FilterLogic) => ` ${l.toUpperCase()} `;
  return f.items
    .map((i) => (isGroup(i) ? `(${i.conditions.map((c) => conditionToText(c, fields)).join(sep(i.logic))})` : conditionToText(i, fields)))
    .join(sep(f.logic));
}
