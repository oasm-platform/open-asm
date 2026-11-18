import type { FilterOp } from '@/common/utils/filter-tree';

export type FieldType =
  | 'text'
  | 'int'
  | 'float'
  | 'bool'
  | 'uuid'
  | 'ip'
  | 'timestamp'
  | 'enum'
  | 'textArray'
  | 'json';

/**
 * How a field may be sorted on. `indexed`: an index `(workspaceId, field, id)`
 * backs it, so any page is an index seek. `bounded`: only when the pre-flight
 * plan estimates a small row set (see engine/preflight.ts).
 */
export type SortKind = 'indexed' | 'bounded';

/**
 * SQL placeholders, replaced by the compiler with quoted aliases or params,
 * never by input:
 *   `{a}`         this resource's alias
 *   `{one:name}`  alias of the one-relation `name` of this resource (list it in `requires`)
 *   `{project}`   the project id parameter (project scope only)
 */
export interface FieldDef {
  sql: string;
  type: FieldType;
  description: string;
  /** NULL possible: filters wrap the test in COALESCE(…, false) so neq/notIn keep NULL rows. */
  nullable?: boolean;
  /** Narrower than the type's operators. */
  ops?: readonly FilterOp[];
  /** Extra value check on top of the type's check. */
  check?: (value: string, op: FilterOp) => boolean;
  enumValues?: readonly string[];
  sortable?: SortKind;
  groupable?: boolean;
  /** Large value (bodies, headers): never in defaultSelect, refused to agents. */
  heavy?: boolean;
  /** ILIKE on it cannot use an index: cost penalty. */
  costlyContains?: boolean;
  /** One-relations its SQL reads through `{one:name}`. */
  requires?: readonly string[];
  /** Needs the fresh-runs CTE (`asq_fresh`) of the query. */
  cte?: 'fresh';
}

export interface OneRelationDef {
  resource: string;
  description: string;
  /** ON clause; `{a}` = this resource, `{b}` = the joined one. */
  on: string;
  join: 'inner' | 'left';
}

export interface ManyRelationDef {
  resource: string;
  description: string;
  /** Column of the child holding the key, quoted (e.g. '"assetServiceId"'). */
  childKey: string;
  /** Parent-side key expression with `{a}` (usually '{a}.id'). */
  parentKey: string;
  /** Extra predicate on the child, `{c}` = child alias. */
  extra?: string;
  /** Child fields an include may sort by: an index (childKey, field) backs each. */
  indexedOrder: readonly string[];
}

export interface ResourceDef {
  name: string;
  /** Table name, quoted when compiled. */
  table: string;
  description: string;
  /** Workspace permission needed to read it (a route key). */
  permission: string;
  /** Usable in `from`. */
  root: boolean;
  /**
   * Not tenant data (tools): no scope column, never a root, no many-relations,
   * only harmless fields. Reached through a one-relation only.
   */
  global?: boolean;
  /**
   * Predicate always ANDed (e.g. approved findings only). `{a}` = this alias.
   */
  basePredicate?: string;
  /**
   * Restricts rows to a project's assets: SQL with `{a}` and `{project}`.
   * `null` = the resource cannot be read in a project-locked scope.
   */
  projectScope: string | null;
  fields: Record<string, FieldDef>;
  one: Record<string, OneRelationDef>;
  many: Record<string, ManyRelationDef>;
  defaultSelect: readonly string[];
  defaultOrder: readonly { field: string; dir: 'asc' | 'desc' }[];
  /** Field a window applies to when `windowField` is omitted. */
  defaultTimeField?: string;
}

/**
 * Every non-global table carries `workspaceId`, kept equal to its parent's by
 * a composite foreign key: the compiler scopes every query on this column.
 */
export const SCOPE_COLUMN = '"workspaceId"';

export type Catalog = Readonly<Record<string, ResourceDef>>;
