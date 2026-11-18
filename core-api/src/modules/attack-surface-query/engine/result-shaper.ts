import type { FieldType } from '../catalog/catalog.types';
import type { CursorValue } from './cursor';
import type { ShapeSpec, SortColumn } from './planner';

export type Row = Record<string, unknown>;

/** Text of a driver scalar; anything else (inet, objects) as JSON. */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value) ?? '';
}

/** Converts one driver value to its JSON form for `type`. */
export function coerce(value: unknown, type: FieldType, maxString: number, onCut: () => void): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case 'int':
    case 'float': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'bool':
      return value === true || value === 't' || value === 'true';
    case 'timestamp':
      return value instanceof Date ? value.toISOString() : new Date(textOf(value)).toISOString();
    case 'textArray':
      return Array.isArray(value) ? value.map((v) => cut(textOf(v), maxString, onCut)) : value;
    case 'json':
      return value;
    default:
      return cut(textOf(value), maxString, onCut);
  }
}

function cut(s: string, max: number, onCut: () => void): string {
  if (s.length <= max) return s;
  onCut();
  return `${s.slice(0, max)}…`;
}

function setPath(target: Row, path: string[], value: unknown): void {
  let node = target;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (next === null) return; // relation already known to be absent
    if (typeof next !== 'object' || next === undefined) node[key] = {};
    node = node[key] as Row;
  }
  node[path[path.length - 1]] = value;
}

/**
 * Builds the nested row of a driver row: `host.value` lands in
 * `{ host: { value } }`, and a one-relation whose id column is NULL becomes
 * `null` instead of an object of nulls.
 */
export function shapeRow(raw: Row, shape: ShapeSpec, maxString: number, onCut: () => void): Row {
  const row: Row = {};
  const absent = shape.relations.filter((r) => raw[r.idAlias] === null || raw[r.idAlias] === undefined);
  // Shallowest first, so a nested absent relation is not recreated below a null.
  for (const relation of absent.sort((a, b) => a.path.length - b.path.length)) {
    setPath(row, relation.path, null);
  }
  for (const column of shape.columns) {
    const under = absent.some(
      (r) => r.path.length < column.path.length && r.path.every((p, i) => column.path[i] === p),
    );
    if (under) continue;
    setPath(row, column.path, coerce(raw[column.alias], column.type, maxString, onCut));
  }
  return row;
}

/** Cursor keys of the last row of a page, from its hidden sort columns. */
export function cursorKeysOf(raw: Row, sortColumns: SortColumn[]): CursorValue[] {
  return sortColumns.map(({ alias, cast }) => {
    const value = raw[alias];
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (cast === 'int8' || cast === 'float8') return Number(value);
    if (typeof value === 'boolean') return value;
    return textOf(value);
  });
}

/** Approximate JSON size, for the response budget. */
export function sizeOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
}
