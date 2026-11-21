import type { FieldType, ManyRelationDef, ResourceDef } from '../catalog/catalog.types';
import type { ResolvedPath } from '../catalog/paths';
import type { QueryMode } from './query.schema';
import type { WhereNode } from './where';

export type AsqCaller = 'http' | 'agent' | 'mcp';

/**
 * Who runs a query. Built from the authenticated request or the agent run,
 * never from the query body.
 */
export interface QueryScope {
  workspaceId: string;
  /** The member's permission keys (`*` = all). */
  permissions: readonly string[];
  caller: AsqCaller;
  /** Locks every root resource to this project's assets. */
  projectId?: string | null;
  abortSignal?: AbortSignal;
}

export type Bucket = 'hour' | 'day' | 'week' | 'month';
export type AggregateFn = 'count' | 'countDistinct' | 'sum' | 'min' | 'max' | 'avg';
export type SortDir = 'asc' | 'desc';

export interface NormalizedOrder {
  /** Field path (list mode) or group/aggregate key (aggregate mode). */
  key: string;
  dir: SortDir;
  path?: ResolvedPath;
  /** Aggregate alias, aggregate mode only. */
  alias?: string;
  /** Bucketed group key, aggregate mode only. */
  bucket?: Bucket;
}

export interface NormalizedInclude {
  /** Name of the many-relation on the parent. */
  name: string;
  def: ManyRelationDef;
  resource: ResourceDef;
  select: ResolvedPath[];
  where?: WhereNode;
  orderBy: NormalizedOrder[];
  /** Rows per parent. */
  limit: number;
  include: NormalizedInclude[];
}

export interface NormalizedGroup {
  key: string;
  path: ResolvedPath;
  bucket?: Bucket;
}

export interface NormalizedAggregate {
  alias: string;
  fn: AggregateFn;
  path?: ResolvedPath;
  /** Rows the aggregate reads (`FILTER (WHERE …)`). */
  where?: WhereNode;
}

/** What a `having` condition tests: a group key or an aggregate, by index. */
export type HavingRef = { kind: 'group' | 'aggregate'; index: number };

export type HavingNode =
  | { kind: 'cond'; ref: HavingRef; op: HavingOp; values: string[]; type: FieldType }
  | { kind: 'group'; logic: 'and' | 'or'; items: HavingNode[] }
  | { kind: 'not'; item: HavingNode };

export type HavingOp = 'eq' | 'neq' | 'in' | 'notIn' | 'gt' | 'gte' | 'lt' | 'lte';

export interface NormalizedWindow {
  path: ResolvedPath;
  since: Date;
  until: Date;
}

/** One query after validation: every path resolved, every default filled. */
export interface NormalizedQuery {
  name: string;
  resource: ResourceDef;
  mode: 'list' | 'aggregate';
  select: ResolvedPath[];
  include: NormalizedInclude[];
  /** Resolved filter, timestamp values as ISO strings. */
  where?: WhereNode;
  window?: NormalizedWindow;
  groupBy: NormalizedGroup[];
  aggregate: NormalizedAggregate[];
  having?: HavingNode;
  /** Emit every bucket of the window (aggregate mode, one time group). */
  fill: boolean;
  /** IANA zone the time buckets are cut in. */
  timezone: string;
  orderBy: NormalizedOrder[];
  limit: number;
  cursor?: string;
  withTotal: boolean;
  /** Hash of the query as written, minus paging: what a cursor is bound to. */
  signature: string;
}

export interface NormalizedBatch {
  now: Date;
  queries: NormalizedQuery[];
  consistent: boolean;
  mode: QueryMode;
  /** Every resource any query reads (root, relations, includes, where). */
  resources: ReadonlySet<string>;
}

/** Rows of one query, or its error (other queries still return). */
export type QueryResult =
  | {
      rows: Record<string, unknown>[];
      nextCursor?: string | null;
      total?: number;
      totalCapped?: boolean;
      truncated: boolean;
    }
  | { error: { code: string; message: string } };

export interface QueryMeta {
  tookMs: number;
  sqlCount: number;
  cost: number;
  rowCount: number;
}

export interface QueryBatchResult {
  data: Record<string, QueryResult>;
  meta: {
    now: string;
    tookMs: number;
    queries: Record<string, QueryMeta>;
  };
}
