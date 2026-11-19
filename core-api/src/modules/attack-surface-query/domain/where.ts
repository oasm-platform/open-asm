import { checkFieldValue, fieldOps, OP_VALUE_SHAPE } from '../catalog/catalog';
import type { AsqOp, Catalog, ManyRelationDef, ResourceDef } from '../catalog/catalog.types';
import { resolvePath, resourcesOf, type ResolvedPath } from '../catalog/paths';
import type { AsqIssueCode } from './query-errors';
import { parseTimeExpr } from './time-window';

/*
 * The `where` language of ASQ, as written:
 *
 *   node      = condition | group | not | relation
 *   condition = { field, op, value? }
 *   group     = { logic: "and" | "or", items: node[] }   (legacy: { logic, conditions })
 *   not       = { not: node }
 *   relation  = { relation, quantifier?: "some" | "none" | "every",
 *                 count?: { op, value }, where?: group }
 *
 * After validation every node is resolved against the catalog (`WhereNode`):
 * the compiler (engine/compile-where.ts) never sees a name the catalog does not
 * declare.
 */

export type Quantifier = 'some' | 'none' | 'every';
export type CountOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
const COUNT_OPS: readonly CountOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];

/** A list relation reached from the filtered resource (after one-relation hops). */
export interface RelationRef {
  /** As written, e.g. `services` or `host.vulnerabilities`. */
  path: string;
  /** One-relation names before the list. */
  chain: string[];
  def: ManyRelationDef;
  child: ResourceDef;
}

export type WhereNode =
  | { kind: 'cond'; path: ResolvedPath; op: AsqOp; values: string[] }
  | { kind: 'group'; logic: 'and' | 'or'; items: WhereNode[] }
  | { kind: 'not'; item: WhereNode }
  | {
      kind: 'rel';
      relation: RelationRef;
      quantifier: Quantifier;
      count?: { op: CountOp; value: number };
      where?: WhereNode;
    };

export interface WhereLimits {
  conditions: number;
  depth: number;
  values: number;
}

/** Longest accepted value string (same as the shared filter tree). */
export const WHERE_VALUE_LENGTH = 255;

const WHERE_RULES = { allowMany: true, maxOneHops: 3 };
/** Inside a relation test: no second list hop. */
const NESTED_RULES = { allowMany: false, maxOneHops: 3 };

export interface WhereContext {
  catalog: Catalog;
  now: Date;
  limits: WhereLimits;
  allowHeavy: boolean;
  /** Records a resource the filter reads (permission check). */
  read: (resource: ResourceDef) => void;
  issue: (path: string, code: AsqIssueCode, message: string) => void;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const ownKeys = (v: Record<string, unknown>, allowed: readonly string[]): string[] =>
  Object.keys(v).filter((k) => !allowed.includes(k));

/** Resolves `host.vulnerabilities`-style paths to a list relation. */
function resolveRelation(catalog: Catalog, root: ResourceDef, path: string): RelationRef | string {
  const segments = path.split('.');
  let current = root;
  const chain: string[] = [];
  for (const [i, name] of segments.entries()) {
    const last = i === segments.length - 1;
    if (!last) {
      const one = Object.prototype.hasOwnProperty.call(current.one, name) ? current.one[name] : undefined;
      if (!one) return `${current.name} has no relation "${name}"`;
      if (chain.length >= WHERE_RULES.maxOneHops) return `"${path}" goes through too many relations`;
      chain.push(name);
      current = catalog[one.resource];
      continue;
    }
    const many = Object.prototype.hasOwnProperty.call(current.many, name) ? current.many[name] : undefined;
    if (!many) {
      const lists = Object.keys(current.many);
      return `${current.name} has no list relation "${name}" (lists: ${lists.join(', ') || 'none'})`;
    }
    return { path, chain, def: many, child: catalog[many.resource] };
  }
  return `"${path}" is empty`;
}

class Walker {
  private conditions = 0;

  constructor(private readonly ctx: WhereContext) {}

  /** Root of a `where`: always a group. */
  root(root: ResourceDef, input: unknown, at: string): WhereNode | undefined {
    if (!isObject(input) || !('logic' in input)) {
      this.ctx.issue(at, 'INVALID_SHAPE', 'where must be {"logic":"and"|"or","items":[...]}');
      return undefined;
    }
    return this.node(root, input, at, 1, true, false);
  }

  /** Recursion guard for `not` chains (they add no group level). */
  private static readonly MAX_NOT_CHAIN = 8;

  private node(
    root: ResourceDef,
    input: unknown,
    at: string,
    depth: number,
    isRoot: boolean,
    nested: boolean,
    notChain = 0,
  ): WhereNode | undefined {
    if (!isObject(input)) {
      this.ctx.issue(at, 'INVALID_SHAPE', 'must be an object');
      return undefined;
    }
    if ('logic' in input) {
      // Depth counts groups: the root group is level 1.
      if (depth > this.ctx.limits.depth) {
        this.ctx.issue(at, 'LIMIT_EXCEEDED', `groups nest at most ${this.ctx.limits.depth} levels`);
        return undefined;
      }
      return this.group(root, input, at, depth, isRoot, nested);
    }
    if ('not' in input) {
      const extra = ownKeys(input, ['not']);
      if (extra.length) this.ctx.issue(at, 'INVALID_SHAPE', `unknown key(s): ${extra.join(', ')}`);
      if (notChain >= Walker.MAX_NOT_CHAIN) {
        this.ctx.issue(at, 'LIMIT_EXCEEDED', `at most ${Walker.MAX_NOT_CHAIN} nested "not"`);
        return undefined;
      }
      const item = this.node(root, input.not, `${at}.not`, depth, false, nested, notChain + 1);
      return item && { kind: 'not', item };
    }
    if ('relation' in input) {
      if (nested) {
        this.ctx.issue(at, 'UNKNOWN_RELATION', 'a relation test cannot contain another relation test');
        return undefined;
      }
      return this.relation(root, input, at, depth);
    }
    return this.condition(root, input, at, nested);
  }

  private group(
    root: ResourceDef,
    input: Record<string, unknown>,
    at: string,
    depth: number,
    isRoot: boolean,
    nested: boolean,
  ): WhereNode | undefined {
    const key = 'conditions' in input && !('items' in input) ? 'conditions' : 'items';
    const extra = ownKeys(input, ['logic', key]);
    if (extra.length) this.ctx.issue(at, 'INVALID_SHAPE', `unknown key(s): ${extra.join(', ')}`);
    const logic = input.logic;
    const items = input[key];
    if ((logic !== 'and' && logic !== 'or') || !Array.isArray(items)) {
      this.ctx.issue(at, 'INVALID_SHAPE', `must be {"logic":"and"|"or","${key}":[...]}`);
      return undefined;
    }
    if (items.length === 0 && !isRoot) {
      this.ctx.issue(at, 'INVALID_SHAPE', 'a group must not be empty');
      return undefined;
    }
    const out: WhereNode[] = [];
    let broken = false;
    for (const [i, item] of items.entries()) {
      const node = this.node(root, item, `${at}.${key}[${i}]`, depth + 1, false, nested);
      if (node) out.push(node);
      else broken = true;
    }
    return broken ? undefined : { kind: 'group', logic, items: out };
  }

  private relation(root: ResourceDef, input: Record<string, unknown>, at: string, depth: number): WhereNode | undefined {
    const extra = ownKeys(input, ['relation', 'quantifier', 'count', 'where']);
    if (extra.length) this.ctx.issue(at, 'INVALID_SHAPE', `unknown key(s): ${extra.join(', ')}`);
    if (typeof input.relation !== 'string') {
      this.ctx.issue(`${at}.relation`, 'INVALID_SHAPE', 'must be the name of a list relation');
      return undefined;
    }
    this.countCondition(at);
    const resolved = resolveRelation(this.ctx.catalog, root, input.relation);
    if (typeof resolved === 'string') {
      this.ctx.issue(`${at}.relation`, 'UNKNOWN_RELATION', resolved);
      return undefined;
    }
    let current = root;
    for (const name of resolved.chain) {
      current = this.ctx.catalog[current.one[name].resource];
      this.ctx.read(current);
    }
    this.ctx.read(resolved.child);

    const quantifier = input.quantifier ?? 'some';
    if (quantifier !== 'some' && quantifier !== 'none' && quantifier !== 'every') {
      this.ctx.issue(`${at}.quantifier`, 'INVALID_VALUE', 'quantifier must be some, none or every');
      return undefined;
    }
    let count: { op: CountOp; value: number } | undefined;
    if (input.count !== undefined) {
      const c = input.count;
      if (!isObject(c) || !COUNT_OPS.includes(c.op as CountOp) || ownKeys(c, ['op', 'value']).length) {
        this.ctx.issue(`${at}.count`, 'INVALID_SHAPE', `count must be {"op":"${COUNT_OPS.join('|')}","value":"<n>"}`);
        return undefined;
      }
      const raw = typeof c.value === 'number' ? String(c.value) : c.value;
      if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw)) {
        this.ctx.issue(`${at}.count.value`, 'INVALID_VALUE', 'count value must be a whole number');
        return undefined;
      }
      if (input.quantifier !== undefined) {
        this.ctx.issue(at, 'MODE_CONFLICT', 'use either quantifier or count');
        return undefined;
      }
      count = { op: c.op as CountOp, value: Number(raw) };
    }
    let where: WhereNode | undefined;
    if (input.where !== undefined) {
      if (!isObject(input.where) || !('logic' in input.where)) {
        this.ctx.issue(`${at}.where`, 'INVALID_SHAPE', 'where must be {"logic":"and"|"or","items":[...]}');
        return undefined;
      }
      where = this.node(resolved.child, input.where, `${at}.where`, depth + 1, false, true);
      if (!where) return undefined;
    } else if (quantifier === 'every') {
      this.ctx.issue(`${at}.where`, 'INVALID_SHAPE', 'every needs a where');
      return undefined;
    }
    return { kind: 'rel', relation: resolved, quantifier, count, where };
  }

  private countCondition(at: string): void {
    this.conditions++;
    if (this.conditions === this.ctx.limits.conditions + 1) {
      this.ctx.issue(at, 'LIMIT_EXCEEDED', `a filter holds at most ${this.ctx.limits.conditions} conditions`);
    }
  }

  private condition(root: ResourceDef, input: Record<string, unknown>, at: string, nested: boolean): WhereNode | undefined {
    const extra = ownKeys(input, ['field', 'op', 'value']);
    if (extra.length) this.ctx.issue(at, 'INVALID_SHAPE', `unknown key(s): ${extra.join(', ')}`);
    this.countCondition(at);
    const { field, op } = input;
    if (typeof field !== 'string') {
      this.ctx.issue(`${at}.field`, 'INVALID_SHAPE', 'field must be a field path');
      return undefined;
    }
    const resolved = resolvePath(this.ctx.catalog, root, field, nested ? NESTED_RULES : WHERE_RULES);
    if (!resolved.ok) {
      this.ctx.issue(`${at}.field "${field}"`, resolved.code, resolved.message);
      return undefined;
    }
    const path = resolved.value;
    if (path.field.heavy && !this.ctx.allowHeavy) {
      this.ctx.issue(at, 'HEAVY_FIELD_NOT_ALLOWED', `"${field}" is a large field and cannot be filtered here`);
      return undefined;
    }
    for (const r of resourcesOf(path)) this.ctx.read(r);

    const ops = fieldOps(path.field);
    if (typeof op !== 'string' || !ops.includes(op as AsqOp)) {
      this.ctx.issue(
        `${at}.op`,
        'OP_NOT_ALLOWED',
        ops.length
          ? `op "${String(op)}" is not allowed for ${field} (ops: ${ops.join(', ')})`
          : `"${field}" cannot be filtered`,
      );
      return undefined;
    }
    const values = this.values(path, op as AsqOp, input.value, at);
    return values && { kind: 'cond', path, op: op as AsqOp, values };
  }

  /** Checks the value shape and every value; resolves time expressions. */
  private values(path: ResolvedPath, op: AsqOp, value: unknown, at: string): string[] | undefined {
    const shape = OP_VALUE_SHAPE[op];
    const here = `${at}.value`;
    if (shape === 'none') {
      if (value !== undefined) {
        this.ctx.issue(here, 'INVALID_VALUE', `${op} takes no value`);
        return undefined;
      }
      return [];
    }
    const isList = shape === 'list' || shape === 'pair';
    if (isList !== Array.isArray(value)) {
      this.ctx.issue(here, 'INVALID_VALUE', `value must be ${shape === 'pair' ? 'an array of 2 values' : isList ? 'an array' : 'a string'}`);
      return undefined;
    }
    const raw = (isList ? value : [value]) as unknown[];
    if (raw.length === 0) {
      this.ctx.issue(here, 'INVALID_VALUE', 'value must not be empty');
      return undefined;
    }
    if (shape === 'pair' && raw.length !== 2) {
      this.ctx.issue(here, 'INVALID_VALUE', 'between takes [from, to]');
      return undefined;
    }
    if (raw.length > this.ctx.limits.values) {
      this.ctx.issue(here, 'INVALID_VALUE', `value has more than ${this.ctx.limits.values} entries`);
      return undefined;
    }
    const out: string[] = [];
    for (const v of raw) {
      if (typeof v !== 'string' || v.length === 0 || v.length > WHERE_VALUE_LENGTH) {
        this.ctx.issue(here, 'INVALID_VALUE', `value entries must be 1-${WHERE_VALUE_LENGTH} character strings`);
        return undefined;
      }
      if (v.includes('\u0000')) {
        this.ctx.issue(here, 'INVALID_VALUE', 'value must not contain NUL characters');
        return undefined;
      }
      let resolved = v;
      if (path.field.type === 'timestamp') {
        const parsed = parseTimeExpr(v, this.ctx.now, { allowFuture: true });
        if (!parsed.ok) {
          this.ctx.issue(here, 'INVALID_TIME', `${path.path}: ${parsed.message}`);
          return undefined;
        }
        resolved = parsed.value.toISOString();
      }
      if (!checkFieldValue(path.field, resolved, op)) {
        const what = op === 'inSubnet' || op === 'notInSubnet' ? 'CIDR' : path.path;
        this.ctx.issue(here, 'INVALID_VALUE', `"${v}" is not a valid ${what}`);
        return undefined;
      }
      out.push(resolved);
    }
    if (shape === 'pair' && path.field.type !== 'timestamp' && Number(out[0]) > Number(out[1])) {
      this.ctx.issue(here, 'INVALID_VALUE', 'between needs from <= to');
      return undefined;
    }
    if (shape === 'pair' && path.field.type === 'timestamp' && out[0] > out[1]) {
      this.ctx.issue(here, 'INVALID_VALUE', 'between needs from <= to');
      return undefined;
    }
    return out;
  }
}

/**
 * Validates a `where` against the catalog and resolves it. Returns undefined
 * when an issue was recorded (the caller throws them all at once).
 */
export function normalizeWhere(
  ctx: WhereContext,
  root: ResourceDef,
  input: unknown,
  at: string,
): WhereNode | undefined {
  return new Walker(ctx).root(root, input, at);
}

/** Every condition of a tree, nested relation filters included. */
export function conditionsOf(node: WhereNode | undefined): Extract<WhereNode, { kind: 'cond' }>[] {
  if (!node) return [];
  switch (node.kind) {
    case 'cond':
      return [node];
    case 'group':
      return node.items.flatMap(conditionsOf);
    case 'not':
      return conditionsOf(node.item);
    case 'rel':
      return conditionsOf(node.where);
  }
}

/** Every relation test of a tree. */
export function relationsOf(node: WhereNode | undefined): Extract<WhereNode, { kind: 'rel' }>[] {
  if (!node) return [];
  switch (node.kind) {
    case 'cond':
      return [];
    case 'group':
      return node.items.flatMap(relationsOf);
    case 'not':
      return relationsOf(node.item);
    case 'rel':
      return [node];
  }
}

/** Conditions that run against the filtered resource itself (not inside a relation test). */
export function ownConditionsOf(node: WhereNode | undefined): Extract<WhereNode, { kind: 'cond' }>[] {
  if (!node) return [];
  switch (node.kind) {
    case 'cond':
      return [node];
    case 'group':
      return node.items.flatMap(ownConditionsOf);
    case 'not':
      return ownConditionsOf(node.item);
    case 'rel':
      return [];
  }
}

/** Paths of `ownConditionsOf`. */
export function topLevelPaths(node: WhereNode | undefined): ResolvedPath[] {
  return ownConditionsOf(node).map((c) => c.path);
}
