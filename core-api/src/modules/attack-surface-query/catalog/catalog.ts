import { isIP, isUUID } from 'class-validator';

import type { FilterOp } from '@/common/utils/filter-tree';

import type {
  Catalog,
  FieldDef,
  FieldType,
  ResourceDef,
} from './catalog.types';
import { RESOURCES } from './resources';

/** Operators each field type allows (a field may narrow them with `ops`). */
export const TYPE_OPS: Record<FieldType, readonly FilterOp[]> = {
  text: ['eq', 'neq', 'contains', 'notContains', 'in', 'notIn'],
  int: ['eq', 'neq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte'],
  float: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  bool: ['eq'],
  uuid: ['eq', 'neq', 'in', 'notIn'],
  ip: ['eq', 'neq', 'in', 'notIn', 'inSubnet'],
  timestamp: ['gt', 'gte', 'lt', 'lte'],
  enum: ['eq', 'neq', 'in', 'notIn'],
  textArray: ['eq', 'neq', 'contains', 'in', 'notIn'],
  json: [],
};

export function isCidr(value: string): boolean {
  const [addr, prefix, extra] = value.split('/');
  if (extra !== undefined || !prefix || !/^\d{1,3}$/.test(prefix) || addr.includes('%')) {
    return false;
  }
  const bits = isIP(addr, 4) ? 32 : isIP(addr, 6) ? 128 : 0;
  return bits > 0 && Number(prefix) <= bits;
}

/**
 * The type's value check. A value Postgres would refuse to cast must be
 * refused here: otherwise it is a 500 instead of a 400. Timestamps arrive
 * already resolved to ISO strings (domain/query-validator.ts).
 */
export function typeCheck(type: FieldType, value: string, op: FilterOp): boolean {
  switch (type) {
    case 'int':
      return /^-?\d{1,10}$/.test(value) && Math.abs(Number(value)) <= 2_147_483_647;
    case 'float':
      return /^-?\d{1,12}(\.\d{1,8})?$/.test(value);
    case 'bool':
      return value === 'true' || value === 'false';
    case 'uuid':
      return isUUID(value);
    case 'ip':
      // inet rejects zone ids (`fe80::1%eth0`): refuse them here
      return op === 'inSubnet' ? isCidr(value) : isIP(value) && !value.includes('%');
    case 'timestamp':
      return !Number.isNaN(new Date(value).getTime());
    case 'text':
    case 'enum':
    case 'textArray':
    case 'json':
      return true;
  }
}

export function fieldOps(field: FieldDef): readonly FilterOp[] {
  return field.ops ?? TYPE_OPS[field.type];
}

/** Checks the type, the enum list and the field's own check. */
export function checkFieldValue(field: FieldDef, value: string, op: FilterOp): boolean {
  if (!typeCheck(field.type, value, op)) return false;
  if (field.enumValues && !field.enumValues.includes(value)) return false;
  return field.check ? field.check(value, op) : true;
}

const PLACEHOLDER = /\{([a-z]+)(?::([a-zA-Z]+))?\}/g;
const ALLOWED_PLACEHOLDERS = new Set(['a', 'one', 'project', 'b', 'c']);

/**
 * Boot check of a catalog: throws on the first rule broken, naming the
 * resource. A resource that could be read without its workspace scope, or a
 * SQL fragment that reaches an alias the compiler does not bind, stops the
 * boot instead of shipping.
 */
export function assertCatalog(catalog: Catalog): void {
  const fail = (resource: string, reason: string): never => {
    throw new Error(`AttackSurfaceQuery catalog: ${resource}: ${reason}`);
  };
  for (const [key, res] of Object.entries(catalog)) {
    if (key !== res.name) fail(key, `registered under "${key}" but named "${res.name}"`);
    if (!/^[a-z][a-zA-Z_]*$/.test(res.table)) fail(res.name, `table "${res.table}" is not a plain identifier`);
    if (res.global) {
      if (res.root) fail(res.name, 'a global resource cannot be a root');
      if (Object.keys(res.many).length > 0) fail(res.name, 'a global resource cannot have many-relations');
    }
    if (res.root && res.projectScope !== null && !res.projectScope.includes('{project}')) {
      fail(res.name, 'projectScope must use {project}');
    }
    for (const [name, field] of Object.entries(res.fields)) {
      if (name in res.one || name in res.many) fail(res.name, `field "${name}" clashes with a relation`);
      if (field.type === 'enum' && !field.enumValues?.length) fail(res.name, `enum field "${name}" has no enumValues`);
      if (field.heavy && field.sortable) fail(res.name, `heavy field "${name}" cannot be sortable`);
      if (field.type === 'json' && (field.sortable || field.groupable)) {
        fail(res.name, `json field "${name}" cannot be sorted or grouped`);
      }
      for (const match of field.sql.matchAll(PLACEHOLDER)) {
        const [, kind, arg] = match;
        if (kind === 'a') continue;
        if (kind === 'one' && arg && field.requires?.includes(arg) && arg in res.one) continue;
        fail(res.name, `field "${name}" uses {${kind}${arg ? `:${arg}` : ''}} without declaring it`);
      }
      for (const required of field.requires ?? []) {
        if (!(required in res.one)) fail(res.name, `field "${name}" requires unknown relation "${required}"`);
      }
    }
    for (const [name, rel] of Object.entries(res.one)) {
      const target = catalog[rel.resource];
      if (!target) fail(res.name, `one-relation "${name}" points at unknown resource "${rel.resource}"`);
      if (!rel.on.includes('{a}') || !rel.on.includes('{b}')) fail(res.name, `one-relation "${name}" must use {a} and {b}`);
    }
    for (const [name, rel] of Object.entries(res.many)) {
      const child = catalog[rel.resource];
      if (!child) fail(res.name, `many-relation "${name}" points at unknown resource "${rel.resource}"`);
      if (child.global) fail(res.name, `many-relation "${name}" cannot point at a global resource`);
      if (!/^"[a-zA-Z]+"$/.test(rel.childKey)) fail(res.name, `many-relation "${name}" childKey must be a quoted column`);
      for (const field of rel.indexedOrder) {
        if (!(field in child.fields)) fail(res.name, `many-relation "${name}" orders by unknown field "${field}"`);
      }
    }
    for (const field of res.defaultSelect) {
      if (!field.includes('.') && !(field in res.fields)) fail(res.name, `defaultSelect has unknown field "${field}"`);
    }
    for (const { field } of res.defaultOrder) {
      if (!(field in res.fields)) fail(res.name, `defaultOrder has unknown field "${field}"`);
    }
    if (res.defaultTimeField && res.fields[res.defaultTimeField]?.type !== 'timestamp') {
      fail(res.name, 'defaultTimeField must be a timestamp field');
    }
    const allSql = [
      res.basePredicate ?? '',
      res.projectScope ?? '',
      ...Object.values(res.one).map((r) => r.on),
      ...Object.values(res.many).map((r) => `${r.parentKey} ${r.extra ?? ''}`),
    ];
    for (const sql of allSql) {
      for (const match of sql.matchAll(PLACEHOLDER)) {
        if (!ALLOWED_PLACEHOLDERS.has(match[1])) fail(res.name, `unknown placeholder {${match[1]}}`);
      }
    }
  }
}

export function buildCatalog(resources: readonly ResourceDef[]): Catalog {
  return Object.freeze(Object.fromEntries(resources.map((r) => [r.name, r])));
}

/** The catalog every query is checked against. */
export const CATALOG: Catalog = buildCatalog(RESOURCES);

/** Short type label of a field for the cheat sheet (text has none). */
function typeLabel(field: FieldDef): string {
  if (field.enumValues) return `:${field.enumValues.join('|')}`;
  switch (field.type) {
    case 'int':
      return ':int';
    case 'float':
      return ':number';
    case 'bool':
      return ':bool';
    case 'timestamp':
      return ':time';
    case 'ip':
      return ':ip';
    case 'uuid':
      return ':id';
    case 'textArray':
      return ':list';
    default:
      return '';
  }
}

/**
 * One line per resource with its exact field names, types and relations, for
 * the agent's tool description: the model sees the real names on every turn
 * instead of guessing them. Never SQL or table names; `id` is left out (every
 * resource has it).
 */
export function catalogCheatSheet(catalog: Catalog): string[] {
  return Object.values(catalog)
    .filter((res) => !res.global)
    .map((res) => {
      const fields = Object.entries(res.fields).filter(([name]) => name !== 'id');
      const light = fields.filter(([, f]) => !f.heavy).map(([name, f]) => `${name}${typeLabel(f)}`);
      const heavy = fields.filter(([, f]) => f.heavy).map(([name]) => name);
      const one = Object.keys(res.one);
      const parts = [
        light.join(', '),
        ...(heavy.length ? [`too large for the agent: ${heavy.join(', ')}`] : []),
        ...(one.length ? [`related: ${one.join(', ')}`] : []),
        ...(Object.keys(res.many).length ? [`lists: ${Object.keys(res.many).join(', ')}`] : []),
      ];
      return `${res.name}${res.root ? '' : ' (only through a relation)'}: ${parts.join('; ')}`;
    });
}

export interface FieldDescription {
  name: string;
  type: FieldType;
  description: string;
  ops: readonly FilterOp[];
  enumValues?: readonly string[];
  sortable?: string;
  groupable?: boolean;
  heavy?: boolean;
}

export interface ResourceDescription {
  name: string;
  description: string;
  root: boolean;
  fields: FieldDescription[];
  one: { name: string; resource: string; description: string }[];
  many: { name: string; resource: string; description: string }[];
  defaultSelect: readonly string[];
  defaultTimeField?: string;
}

/**
 * What /schema and the agent see: names, types, operators and relations of
 * the resources the caller may read. Never SQL or table names.
 */
export function describeCatalog(
  catalog: Catalog,
  canRead: (permission: string) => boolean,
  options: { compact?: boolean } = {},
): ResourceDescription[] {
  return Object.values(catalog)
    .filter((res) => !res.global && canRead(res.permission))
    .map((res) => ({
      name: res.name,
      description: res.description,
      root: res.root,
      fields: Object.entries(res.fields).map(([name, f]) => ({
        name,
        type: f.type,
        description: options.compact ? '' : f.description,
        ops: fieldOps(f),
        ...(f.enumValues ? { enumValues: f.enumValues } : {}),
        ...(f.sortable ? { sortable: f.sortable } : {}),
        ...(f.groupable ? { groupable: true } : {}),
        ...(f.heavy ? { heavy: true } : {}),
      })),
      one: Object.entries(res.one)
        .filter(([, r]) => catalog[r.resource].global || canRead(catalog[r.resource].permission))
        .map(([name, r]) => ({ name, resource: r.resource, description: options.compact ? '' : r.description })),
      many: Object.entries(res.many)
        .filter(([, r]) => canRead(catalog[r.resource].permission))
        .map(([name, r]) => ({ name, resource: r.resource, description: options.compact ? '' : r.description })),
      defaultSelect: res.defaultSelect,
      ...(res.defaultTimeField ? { defaultTimeField: res.defaultTimeField } : {}),
    }));
}
