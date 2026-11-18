import type { Logger } from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';

import { AsqError } from '../domain/query-errors';
import type { AsqLimits } from '../domain/query-limits';
import type { QueryMeta, QueryResult } from '../domain/query.types';
import { mapLimited, type Semaphore } from './concurrency';
import type { CursorCodec } from './cursor';
import { mapPgError } from './pg-errors';
import type { IncludePlan, QueryPlan } from './planner';
import { assertPlanWithinLimits, readPlan } from './preflight';
import { cursorKeysOf, shapeRow, sizeOf, type Row } from './result-shaper';
import type { CompiledSql } from './sql-builder';

/** The role RLS policies are written for (migration AddAttackSurfaceQuery…). */
export const ASQ_READER_ROLE = 'asq_reader';

/** Parent keys sent per include statement. */
const INCLUDE_KEY_CHUNK = 1000;

export type Isolation = 'READ COMMITTED' | 'REPEATABLE READ';

export interface UnitOptions {
  statementTimeoutMs: number;
  isolation: Isolation;
  /** Switch to the RLS role and bind the workspace for its policies. */
  rls: boolean;
  workspaceId: string;
}

export type RunSql = (statement: CompiledSql, timeoutMs?: number) => Promise<Row[]>;

/**
 * One read-only transaction on one connection. `SET LOCAL` values (timeouts,
 * role, workspace setting) die with the transaction, so the connection goes
 * back to the pool clean. It always ends in ROLLBACK: nothing is written, and
 * the snapshot is released at once.
 */
export async function withReadOnlyUnit<T>(
  dataSource: DataSource,
  options: UnitOptions,
  work: (run: RunSql) => Promise<T>,
): Promise<T> {
  const runner: QueryRunner = dataSource.createQueryRunner('slave');
  await runner.connect();
  try {
    // Constants only: SET takes no bind parameters.
    await runner.query(`BEGIN ISOLATION LEVEL ${options.isolation === 'REPEATABLE READ' ? 'REPEATABLE READ' : 'READ COMMITTED'} READ ONLY`);
    await runner.query(`SET LOCAL lock_timeout = 1000`);
    await runner.query(`SET LOCAL idle_in_transaction_session_timeout = ${Math.trunc(options.statementTimeoutMs) * 3 + 1000}`);
    if (options.rls) {
      await runner.query(`SET LOCAL ROLE ${ASQ_READER_ROLE}`);
      await runner.query(`SELECT set_config('app.workspace_id', $1, true)`, [options.workspaceId]);
    }
    let currentTimeout = -1;
    const run: RunSql = async (statement, timeoutMs = options.statementTimeoutMs) => {
      const ms = Math.max(1, Math.trunc(timeoutMs));
      if (ms !== currentTimeout) {
        await runner.query(`SET LOCAL statement_timeout = ${ms}`);
        currentTimeout = ms;
      }
      const [sql, params] = runner.connection.driver.escapeQueryWithParameters(
        statement.sql,
        statement.params,
        {},
      );
      return (await runner.query(sql, params)) as Row[];
    };
    return await work(run);
  } finally {
    await runner.query('ROLLBACK').catch(() => undefined);
    await runner.release();
  }
}

export interface ExecutionContext {
  dataSource: DataSource;
  limits: AsqLimits;
  semaphore: Semaphore;
  codec: CursorCodec;
  workspaceId: string;
  rls: boolean;
  /** Pre-flight EXPLAIN before each root statement. */
  preflight: boolean;
  consistent: boolean;
  /** Queries run in parallel (each on its own connection). */
  parallel: number;
  deadline: number;
  abortSignal?: AbortSignal;
  logger: Pick<Logger, 'warn' | 'error'>;
}

export interface PlanOutcome {
  result: QueryResult;
  meta: Omit<QueryMeta, 'cost'>;
}

class Budget {
  bytes = 0;
  constructor(readonly max: number) {}
}

/** Runs the include statements of `parents` and attaches their rows. */
async function attachIncludes(
  run: RunSql,
  includes: IncludePlan[],
  parentsRaw: Row[],
  parents: Row[],
  ctx: ExecutionContext,
  meta: { sqlCount: number },
  onCut: () => void,
  remaining: () => number,
): Promise<void> {
  for (const include of includes) {
    const byKey = new Map<string, Row[]>();
    const keys = [...new Set(parentsRaw.map((r) => r[include.parentKeyAlias]).filter((k): k is string => typeof k === 'string'))];
    for (let i = 0; i < keys.length; i += INCLUDE_KEY_CHUNK) {
      checkDeadline(ctx);
      const childRaw = await run(include.build(keys.slice(i, i + INCLUDE_KEY_CHUNK)), remaining());
      meta.sqlCount++;
      const shaped = childRaw.map((raw) => shapeRow(raw, include.shape, ctx.limits.maxStringLength, onCut));
      if (include.children.length) {
        await attachIncludes(run, include.children, childRaw, shaped, ctx, meta, onCut, remaining);
      }
      childRaw.forEach((raw, j) => {
        const key = String(raw.__parent);
        const list = byKey.get(key) ?? [];
        list.push(shaped[j]);
        byKey.set(key, list);
      });
    }
    parentsRaw.forEach((raw, i) => {
      const key = raw[include.parentKeyAlias];
      parents[i][include.name] = typeof key === 'string' ? (byKey.get(key) ?? []) : [];
    });
  }
}

function checkDeadline(ctx: ExecutionContext): void {
  if (ctx.abortSignal?.aborted) throw new AsqError('QUERY_TIMEOUT', 'The request was cancelled');
  if (Date.now() >= ctx.deadline) throw new AsqError('QUERY_TIMEOUT', 'The request ran out of time');
}

async function runPlan(
  run: RunSql,
  plan: QueryPlan,
  ctx: ExecutionContext,
  budget: Budget,
): Promise<PlanOutcome> {
  const started = Date.now();
  const meta = { sqlCount: 0 };
  const remaining = () => Math.min(ctx.limits.statementTimeoutMs, Math.max(1, ctx.deadline - Date.now()));
  try {
    checkDeadline(ctx);
    if (ctx.preflight) {
      const explain = await run({ sql: `EXPLAIN (FORMAT JSON) ${plan.root.sql}`, params: plan.root.params }, remaining());
      assertPlanWithinLimits(plan.name, readPlan(explain), ctx.limits, plan.boundedSort);
    }
    checkDeadline(ctx);
    let raw = await run(plan.root, remaining());
    meta.sqlCount++;

    let truncated = false;
    const onCut = () => {
      truncated = true;
    };
    const hasMore = plan.mode === 'list' && raw.length > plan.limit;
    if (hasMore) raw = raw.slice(0, plan.limit);

    let total: number | undefined;
    let totalCapped: boolean | undefined;
    if (plan.total) {
      checkDeadline(ctx);
      const [row] = await run(plan.total, remaining());
      meta.sqlCount++;
      const n = Number(row?.n ?? 0);
      totalCapped = n > 10_000;
      total = Math.min(n, 10_000);
    }

    const rows = raw.map((r) => shapeRow(r, plan.shape, ctx.limits.maxStringLength, onCut));
    await attachIncludes(run, plan.includes, raw, rows, ctx, meta, onCut, remaining);

    // Response budget: keep whole rows while they fit.
    let kept = rows.length;
    for (let i = 0; i < rows.length; i++) {
      budget.bytes += sizeOf(rows[i]);
      if (budget.bytes > budget.max) {
        kept = i;
        truncated = true;
        break;
      }
    }
    const cutByBudget = kept < rows.length;
    const out = rows.slice(0, kept);

    const result: QueryResult =
      plan.mode === 'aggregate'
        ? { rows: out, truncated }
        : {
            rows: out,
            nextCursor:
              (hasMore || cutByBudget) && kept > 0
                ? ctx.codec.encode(plan.signature, ctx.workspaceId, cursorKeysOf(raw[kept - 1], plan.sortColumns))
                : null,
            ...(total !== undefined ? { total, totalCapped } : {}),
            truncated,
          };
    return { result, meta: { tookMs: Date.now() - started, sqlCount: meta.sqlCount, rowCount: out.length } };
  } catch (err) {
    const { error, bug } = mapPgError(err, ctx.limits.statementTimeoutMs);
    if (bug) ctx.logger.error(`AttackSurfaceQuery "${plan.name}" failed: ${(err as Error).message}\n${plan.root.sql}`);
    else if (!(err instanceof AsqError)) ctx.logger.warn(`AttackSurfaceQuery "${plan.name}": ${(err as Error).message}`);
    return {
      result: { error: { code: error.code, message: error.message, ...error.details } },
      meta: { tookMs: Date.now() - started, sqlCount: meta.sqlCount, rowCount: 0 },
    };
  }
}

/**
 * Runs the plans of a batch. Default: one read-only unit per query, up to
 * `parallel` at once, each holding a slot of the process-wide semaphore.
 * `consistent`: one REPEATABLE READ unit, queries in sequence, one snapshot.
 * A query's runtime failure (timeout, planner refusal) is its own result;
 * the others still return.
 */
export async function executePlans(plans: QueryPlan[], ctx: ExecutionContext): Promise<PlanOutcome[]> {
  const budget = new Budget(ctx.limits.maxResponseBytes);
  const unit = (isolation: Isolation) => ({
    statementTimeoutMs: ctx.limits.statementTimeoutMs,
    isolation,
    rls: ctx.rls,
    workspaceId: ctx.workspaceId,
  });
  if (ctx.consistent) {
    const release = await ctx.semaphore.acquire();
    try {
      return await withReadOnlyUnit(ctx.dataSource, unit('REPEATABLE READ'), async (run) => {
        const outcomes: PlanOutcome[] = [];
        for (const plan of plans) outcomes.push(await runPlan(run, plan, ctx, budget));
        return outcomes;
      });
    } finally {
      release();
    }
  }
  return mapLimited(plans, ctx.parallel, async (plan) => {
    const release = await ctx.semaphore.acquire();
    try {
      return await withReadOnlyUnit(ctx.dataSource, unit('READ COMMITTED'), (run) => runPlan(run, plan, ctx, budget));
    } finally {
      release();
    }
  });
}
