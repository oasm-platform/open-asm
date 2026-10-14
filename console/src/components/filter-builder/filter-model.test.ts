import { describe, expect, it } from 'vitest';
import {
  addCondition, conditionError, countConditions, decodeFilter, encodeFilter, filterError,
  filterToText, groupWithPrevious, removeCondition, toggleLogic, ungroup, updateCondition,
  type Filter, type FilterFieldConfig,
} from './filter-model';

const noSuggest = () => ({ options: [], isFetching: false });
const fields: FilterFieldConfig[] = [
  { key: 'host', label: 'Host', operators: ['eq', 'contains', 'in'], useSuggestions: noSuggest },
  { key: 'port', label: 'Port', operators: ['eq', 'in'], useSuggestions: noSuggest,
    validate: (v) => (/^\d+$/.test(v) ? null : 'Port must be a number') },
];
const f: Filter = {
  logic: 'and',
  items: [
    { field: 'host', op: 'contains', value: 'api' },
    { logic: 'or', conditions: [{ field: 'port', op: 'in', value: ['80', '443'] }, { field: 'host', op: 'eq', value: 'x' }] },
  ],
};

describe('filter-model', () => {
  it('round-trips through the URL encoding', () => {
    expect(decodeFilter(encodeFilter(f))).toEqual(f);
  });
  it('encodes an empty filter as undefined and rejects garbage', () => {
    expect(encodeFilter({ logic: 'and', items: [] })).toBeUndefined();
    expect(decodeFilter('{bad')).toBeUndefined();
    expect(decodeFilter('{"logic":"xor","items":[]}')).toBeUndefined();
  });
  it('renders query text with labels and grouping', () => {
    expect(filterToText(f, fields)).toBe('Host contains "api" AND (Port in ["80", "443"] OR Host = "x")');
  });
  it('counts conditions across groups', () => {
    expect(countConditions(f)).toBe(3);
    expect(countConditions(undefined)).toBe(0);
  });
  it('adds a blank condition using the first field and its first op', () => {
    const next = addCondition({ logic: 'and', items: [] }, fields);
    expect(next.items).toEqual([{ field: 'host', op: 'eq', value: '' }]);
  });
  it('changing field resets an unsupported op and the value shape', () => {
    const next = updateCondition(f, [0], { field: 'port' }, fields);
    expect(next.items[0]).toEqual({ field: 'port', op: 'eq', value: '' });
  });
  it('changing op between scalar and list converts the value', () => {
    const next = updateCondition(f, [0], { op: 'in' }, fields);
    expect(next.items[0]).toEqual({ field: 'host', op: 'in', value: ['api'] });
  });
  it('groups a row with the previous row, appending to an existing group', () => {
    const base: Filter = { logic: 'and', items: [{ field: 'host', op: 'eq', value: 'a' }, { field: 'host', op: 'eq', value: 'b' }] };
    expect(groupWithPrevious(base, 1).items).toEqual([
      { logic: 'or', conditions: [{ field: 'host', op: 'eq', value: 'a' }, { field: 'host', op: 'eq', value: 'b' }] },
    ]);
    const withExtra: Filter = { ...f, items: [...f.items, { field: 'host', op: 'eq', value: 'z' }] };
    expect((groupWithPrevious(withExtra, 2).items[1] as { conditions: unknown[] }).conditions).toHaveLength(3);
  });
  it('ungrouping or removing down to one condition flattens the group', () => {
    expect(removeCondition(f, [1, 0]).items[1]).toEqual({ field: 'host', op: 'eq', value: 'x' });
    expect(ungroup(f, 1, 0).items).toEqual([
      f.items[0], { field: 'host', op: 'eq', value: 'x' }, { field: 'port', op: 'in', value: ['80', '443'] },
    ]);
  });
  it('toggles root and group logic independently', () => {
    expect(toggleLogic(f).logic).toBe('or');
    expect((toggleLogic(f, 1).items[1] as { logic: string }).logic).toBe('and');
  });
  it('reports incomplete and invalid conditions', () => {
    expect(conditionError({ field: 'host', op: 'eq', value: '' }, fields)).toBe('Value is required');
    expect(conditionError({ field: 'port', op: 'in', value: ['80', 'x'] }, fields)).toBe('Port must be a number');
    expect(conditionError({ field: 'host', op: 'in', value: Array(51).fill('a') }, fields)).toMatch(/50/);
    expect(filterError(f, fields)).toBeNull();
    expect(filterError({ logic: 'and', items: Array(21).fill({ field: 'host', op: 'eq', value: 'a' }) }, fields)).toMatch(/20/);
  });
});
