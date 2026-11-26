import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { BullMQName } from '@/common/enums/enum';
import { firstMissingPermission } from '@/common/utils/permission-keys.util';
import { RedisService } from '@/services/redis/redis.service';

import { AsqConnectionsService } from './asq-connections.service';
import { CATALOG, describeCatalog, type ResourceDescription } from './catalog/catalog';
import { estimateCost, assertWithinBudget } from './domain/query-cost';
import { AsqError } from './domain/query-errors';
import { limitsFor } from './domain/query-limits';
import type { QueryBatchInput } from './domain/query.schema';
import type {
  NormalizedBatch,
  QueryBatchResult,
  QueryMeta,
  QueryScope,
} from './domain/query.types';
import { parseBatch, validateBatch } from './domain/query-validator';
import { executePlans, withReadOnlyUnit } from './engine/executor';
import { cursorKeyCount, planQuery, type QueryPlan } from './engine/planner';
import { readPlan } from './engine/preflight';

/** Payload of an ASQ_REPORT job: the caller as it was when enqueued. */
export interface AsqReportJob {
  workspaceId: string;
  permissions: string[];
  projectId?: string | null;
  input: QueryBatchInput;
}

export type AsqReportStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AsqReportState {
  jobId: string;
  status: AsqReportStatus;
  result?: QueryBatchResult;
  error?: { code: string; message: string };
}

/** Report results stay this long in Redis. */
export const REPORT_RESULT_TTL_S = 3600;
const reportKey = (workspaceId: string, jobId: string) => `asq:report:${workspaceId}:${jobId}`;

export interface ExplainResult {
  queries: Record<
    string,
    {
      cost: number;
      budget: number;
      hints: string[];
      resources: string[];
      planner?: { totalCost: number; sortRows: number };
      sqlTemplate?: string;
    }
  >;
}

/**
 * Attack surface queries: validates a JSON query batch against the catalog
 * and the caller, compiles it to scoped, parameterized SQL and runs it
 * read-only. Used by the REST API, the agent/MCP tools, saved queries and
 * report jobs.
 */
@Injectable()
export class AttackSurfaceQueryService {
  private readonly logger = new Logger(AttackSurfaceQueryService.name);

  constructor(
    private readonly connections: AsqConnectionsService,
    private readonly redis: RedisService,
    @InjectQueue(BullMQName.ASQ_REPORT)
    private readonly reportQueue: Queue<AsqReportJob>,
  ) {}

  /** The resources, fields and operators the caller may use. */
  describe(scope: Pick<QueryScope, 'permissions'>, options: { compact?: boolean } = {}): ResourceDescription[] {
    return describeCatalog(
      CATALOG,
      (permission) => firstMissingPermission(scope.permissions, [permission]) === null,
      options,
    );
  }

  /** Parses and validates; throws AsqError. */
  validate(scope: QueryScope, input: unknown, now = new Date()): NormalizedBatch {
    return validateBatch(CATALOG, parseBatch(input), scope, now);
  }

  /**
   * Runs a batch. Report mode is HTTP-only and queued: the call returns the
   * job to poll. Caller `report` runs synchronously (interactive mode only)
   * and is refused report mode.
   */
  async run(scope: QueryScope, input: unknown): Promise<QueryBatchResult | AsqReportState> {
    const parsed = parseBatch(input);
    const batch = validateBatch(CATALOG, parsed, scope, new Date());
    const limits = limitsFor(scope.caller, batch.mode);
    const costs = batch.queries.map((q) => assertWithinBudget(q, limits));
    if (batch.mode === 'report') return this.enqueueReport(scope, parsed);
    return this.execute(scope, batch, costs);
  }

  /** Validation, cost and planner estimates of a batch, without running it. */
  async explain(scope: QueryScope, input: unknown, withSql: boolean): Promise<ExplainResult> {
    const batch = this.validate(scope, input);
    const limits = limitsFor(scope.caller, batch.mode);
    const plans = this.plan(scope, batch);
    const queries: ExplainResult['queries'] = {};
    const release = await this.connections.semaphore.acquire();
    try {
      await withReadOnlyUnit(
        this.connections.dataSourceFor(batch.mode),
        { statementTimeoutMs: limits.statementTimeoutMs, isolation: 'READ COMMITTED', rls: this.connections.rls, workspaceId: scope.workspaceId },
        async (run) => {
          for (const [i, query] of batch.queries.entries()) {
            const { cost, hints } = estimateCost(query);
            const plan = plans[i];
            const explain = await run({ sql: `EXPLAIN (FORMAT JSON) ${plan.root.sql}`, params: plan.root.params });
            queries[query.name] = {
              cost,
              budget: limits.costBudget,
              hints,
              resources: [...new Set([query.resource.name, ...query.include.map((inc) => inc.resource.name)])],
              planner: readPlan(explain),
              ...(withSql ? { sqlTemplate: plan.root.sql } : {}),
            };
          }
        },
      );
    } finally {
      release();
    }
    return { queries };
  }

  private plan(scope: QueryScope, batch: NormalizedBatch): QueryPlan[] {
    return batch.queries.map((query, index) => {
      const keys = query.cursor
        ? this.connections.codec.decode(query.cursor, query.signature, scope.workspaceId, cursorKeyCount(query))
        : undefined;
      return planQuery(CATALOG, query, { workspaceId: scope.workspaceId, projectId: scope.projectId }, keys, index);
    });
  }

  private async execute(scope: QueryScope, batch: NormalizedBatch, costs: number[]): Promise<QueryBatchResult> {
    const started = Date.now();
    const limits = limitsFor(scope.caller, batch.mode);
    const plans = this.plan(scope, batch);
    const outcomes = await executePlans(plans, {
      dataSource: this.connections.dataSourceFor(batch.mode),
      limits,
      semaphore: this.connections.semaphore,
      codec: this.connections.codec,
      workspaceId: scope.workspaceId,
      rls: this.connections.rls,
      preflight: batch.mode === 'interactive',
      consistent: batch.consistent,
      parallel: scope.caller === 'http' ? 3 : 1,
      deadline: started + limits.batchBudgetMs,
      abortSignal: scope.abortSignal,
      logger: this.logger,
    });
    const data: QueryBatchResult['data'] = {};
    const metas: Record<string, QueryMeta> = {};
    batch.queries.forEach((query, i) => {
      data[query.name] = outcomes[i].result;
      metas[query.name] = { ...outcomes[i].meta, cost: costs[i] };
    });
    this.logger.log(
      `asq workspace=${scope.workspaceId} caller=${scope.caller} queries=${batch.queries.length} resources=${[...batch.resources].join(',')} tookMs=${Date.now() - started}`,
    );
    return { data, meta: { now: batch.now.toISOString(), tookMs: Date.now() - started, queries: metas } };
  }

  private async enqueueReport(scope: QueryScope, input: QueryBatchInput): Promise<AsqReportState> {
    const jobId = randomUUID();
    await this.reportQueue.add(
      'run',
      { workspaceId: scope.workspaceId, permissions: [...scope.permissions], projectId: scope.projectId ?? null, input },
      { jobId, removeOnComplete: { age: REPORT_RESULT_TTL_S }, removeOnFail: { age: REPORT_RESULT_TTL_S } },
    );
    await this.saveReportState(scope.workspaceId, { jobId, status: 'queued' });
    return { jobId, status: 'queued' };
  }

  /** Runs a queued report job (called by the processor). */
  async runReportJob(jobId: string, job: AsqReportJob): Promise<void> {
    await this.saveReportState(job.workspaceId, { jobId, status: 'running' });
    const scope: QueryScope = {
      workspaceId: job.workspaceId,
      permissions: job.permissions,
      caller: 'http',
      projectId: job.projectId,
    };
    try {
      const batch = validateBatch(CATALOG, parseBatch(job.input), scope, new Date());
      const limits = limitsFor('http', 'report');
      const costs = batch.queries.map((q) => assertWithinBudget(q, limits));
      const result = await this.execute(scope, batch, costs);
      await this.saveReportState(job.workspaceId, { jobId, status: 'completed', result });
    } catch (err) {
      const error = err instanceof AsqError ? err : new AsqError('INTERNAL', 'The report could not be run');
      if (!(err instanceof AsqError)) this.logger.error(`ASQ report ${jobId} failed: ${(err as Error).message}`);
      await this.saveReportState(job.workspaceId, { jobId, status: 'failed', error: { code: error.code, message: error.message } });
    }
  }

  /** State of a report job of the workspace; NOT_FOUND for another tenant's id. */
  async getReport(workspaceId: string, jobId: string): Promise<AsqReportState> {
    const raw = await this.redis.cacheClient.get(reportKey(workspaceId, jobId));
    if (!raw) throw new AsqError('NOT_FOUND', 'No such report job (results expire after one hour)');
    return JSON.parse(raw) as AsqReportState;
  }

  private async saveReportState(workspaceId: string, state: AsqReportState): Promise<void> {
    await this.redis.cacheClient.set(reportKey(workspaceId, state.jobId), JSON.stringify(state), 'EX', REPORT_RESULT_TTL_S);
  }
}
