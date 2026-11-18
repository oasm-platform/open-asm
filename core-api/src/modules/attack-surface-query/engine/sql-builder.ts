import { LATEST_RUNS_CTE, latestCoveringRunsCte } from '@/modules/assets/fresh-runs';

import type { Catalog, FieldDef, ResourceDef } from '../catalog/catalog.types';
import { SCOPE_COLUMN } from '../catalog/catalog.types';
import type { ResolvedPath } from '../catalog/paths';

/** SQL with named `:params` (TypeORM style) and their values. */
export interface CompiledSql {
  sql: string;
  params: Record<string, unknown>;
}

/** Identifiers here come from the catalog only; quoting is still applied. */
export const q = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/** Postgres array type a filter value list is cast to, by field type. */
export const PG_ARRAY_TYPE: Partial<Record<FieldDef['type'], string>> = {
  text: 'text[]',
  enum: 'text[]',
  int: 'int8[]',
  float: 'float8[]',
  bool: 'boolean[]',
  uuid: 'uuid[]',
  ip: 'inet[]',
  textArray: 'text[]',
};

/** Postgres scalar type of a comparison value. */
export const PG_SCALAR_TYPE: Partial<Record<FieldDef['type'], string>> = {
  int: 'int8',
  float: 'float8',
  timestamp: 'timestamptz',
};

/** Collects bound values under unique names. */
export class ParamBag {
  readonly values: Record<string, unknown> = {};
  private n = 0;
  constructor(readonly prefix: string) {}

  /** Binds `value` and returns its placeholder. */
  add(value: unknown): string {
    const name = `${this.prefix}p${this.n++}`;
    this.values[name] = value;
    return `:${name}`;
  }

  merge(values: Record<string, unknown>): void {
    Object.assign(this.values, values);
  }
}

/** The workspace (and optional project) every compiled statement is bound to. */
export interface ScopeParams {
  workspace: string;
  project?: string;
}

/**
 * Expands `{a}`, `{b}`, `{c}`, `{one:name}` and `{project}` in a catalog
 * fragment. Every alias passed in is already quoted.
 */
export function expand(
  sql: string,
  aliases: { a?: string; b?: string; c?: string; one?: Record<string, string>; project?: string },
): string {
  return sql.replace(/\{([a-z]+)(?::([a-zA-Z]+))?\}/g, (whole, kind: string, arg?: string) => {
    if (kind === 'one' && arg && aliases.one?.[arg]) return aliases.one[arg];
    const value = (aliases as Record<string, unknown>)[kind];
    if (typeof value === 'string') return value;
    throw new Error(`AttackSurfaceQuery compiler: unbound placeholder ${whole}`);
  });
}

/**
 * FROM-clause builder for one resource: tracks the one-relation joins a
 * statement needs (each joined once, parents first) and renders field
 * expressions against the right alias.
 */
export class FromBuilder {
  private readonly joins = new Map<string, string>();
  private readonly order: string[] = [];
  usesFreshCte = false;

  constructor(
    readonly catalog: Catalog,
    readonly root: ResourceDef,
    /** Unquoted root alias, e.g. `r`, `i0`, `x3`. */
    readonly rootAlias: string,
  ) {}

  /** Quoted alias of the one-relation chain `names` (root for []). */
  aliasOf(names: readonly string[]): string {
    return q([this.rootAlias, ...names].join('__'));
  }

  /** Ensures the joins of `names` exist; returns the resource at the end. */
  ensureChain(names: readonly string[]): ResourceDef {
    let resource = this.root;
    for (let i = 0; i < names.length; i++) {
      const rel = resource.one[names[i]];
      if (!rel) throw new Error(`AttackSurfaceQuery compiler: ${resource.name} has no relation ${names[i]}`);
      const target = this.catalog[rel.resource];
      const chain = names.slice(0, i + 1);
      const key = chain.join('.');
      if (!this.joins.has(key)) {
        const parentAlias = this.aliasOf(names.slice(0, i));
        const alias = this.aliasOf(chain);
        const on = expand(rel.on, { a: parentAlias, b: alias });
        const tenant = target.global ? '' : ` AND ${alias}.${SCOPE_COLUMN} = ${parentAlias}.${SCOPE_COLUMN}`;
        this.joins.set(
          key,
          `${rel.join === 'inner' ? 'INNER' : 'LEFT'} JOIN ${q(target.table)} ${alias} ON (${on})${tenant}`,
        );
        this.order.push(key);
      }
      resource = target;
    }
    return resource;
  }

  /** One-relation names of a path before any many hop. */
  static oneChain(path: ResolvedPath): string[] {
    const names: string[] = [];
    for (const hop of path.hops) {
      if (hop.kind === 'many') break;
      names.push(hop.name);
    }
    return names;
  }

  /** SQL of a field of the resource at `chain`, joining what it needs. */
  fieldSql(chain: readonly string[], field: FieldDef): string {
    this.ensureChain(chain);
    const one: Record<string, string> = {};
    for (const required of field.requires ?? []) {
      this.ensureChain([...chain, required]);
      one[required] = this.aliasOf([...chain, required]);
    }
    if (field.cte === 'fresh') this.usesFreshCte = true;
    return `(${expand(field.sql, { a: this.aliasOf(chain), one })})`;
  }

  /** SQL of a resolved path that has no many hop. */
  pathSql(path: ResolvedPath): string {
    return this.fieldSql(FromBuilder.oneChain(path), path.field);
  }

  renderFrom(): string {
    return [`${q(this.root.table)} ${this.aliasOf([])}`, ...this.order.map((k) => this.joins.get(k))].join('\n  ');
  }
}

/** `WITH` clause for the fresh-runs CTE when a statement needs it. */
export function withClause(usesFreshCte: boolean, workspaceParam: string): string {
  return usesFreshCte
    ? `WITH ${LATEST_RUNS_CTE} AS MATERIALIZED (${latestCoveringRunsCte(workspaceParam)})\n`
    : '';
}

/** Value of a SELECTed field: times as timestamptz (the columns are `timestamp`). */
export function selectExpr(sql: string, field: FieldDef): string {
  return field.type === 'timestamp' ? `${sql}::timestamptz` : sql;
}

/** The mandatory predicates of a root: tenant, project and base predicate. */
export function scopePredicates(
  resource: ResourceDef,
  alias: string,
  scope: ScopeParams,
): string[] {
  const parts = [`${alias}.${SCOPE_COLUMN} = ${scope.workspace}`];
  if (scope.project) {
    if (resource.projectScope === null) {
      throw new Error(`AttackSurfaceQuery compiler: ${resource.name} cannot be project-scoped`);
    }
    parts.push(`(${expand(resource.projectScope, { a: alias, project: scope.project })})`);
  }
  if (resource.basePredicate) parts.push(`(${expand(resource.basePredicate, { a: alias })})`);
  return parts;
}
