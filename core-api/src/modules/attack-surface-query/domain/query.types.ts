import type { FilterTree } from '@/common/utils/filter-tree';

import type { ManyRelationDef, ResourceDef } from '../catalog/catalog.types';
import type { ResolvedPath } from '../catalog/paths';
import type { QueryMode } from './query.schema';

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
export type AggregateFn = 'count' | 'countDistinct' | 'min' | 'max' | 'avg';
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
  where?: FilterTree;
  wherePaths: ReadonlyMap<string, ResolvedPath>;
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
}

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
  /** Filter tree with timestamp values resolved to ISO strings. */
  where?: FilterTree;
  /** Paths named in `where`, by path. */
  wherePaths: ReadonlyMap<string, ResolvedPath>;
  window?: NormalizedWindow;
  groupBy: NormalizedGroup[];
  aggregate: NormalizedAggregate[];
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
