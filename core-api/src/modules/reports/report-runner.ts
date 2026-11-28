import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@/common/errors/domain.errors';
import { AttackSurfaceQueryService } from '@/modules/attack-surface-query/attack-surface-query.service';
import type { QueryBatchResult, QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import type { QueryBatchInput } from '@/modules/attack-surface-query/domain/query.schema';
import type { BuiltinTemplate } from './templates/template.types';

/** Runs a builtin template's queries as the caller and turns the results into the document's data. */
@Injectable()
export class ReportRunner {
  private readonly logger = new Logger(ReportRunner.name);

  constructor(
    private readonly asq: AttackSurfaceQueryService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async run<O, D>(template: BuiltinTemplate<O, D>, scope: QueryScope, options: O): Promise<D> {
    // The workspace guard already checked membership, so no user context is needed to read the name.
    const [workspace] = await this.workspaces.getWorkspacesByIds([scope.workspaceId]);
    if (!workspace) throw new NotFoundError('Workspace not found');

    const now = new Date();
    const results: QueryBatchResult[] = [];
    for (const batch of template.queries(options, now)) {
      // Caller 'report' never gets a queued report job back, so the result is always a batch.
      const result = (await this.asq.run(scope, batch)) as QueryBatchResult;
      this.warnCapped(template.id, batch, result);
      results.push(result);
    }
    return template.toData(results, { workspaceName: workspace.name, now, options });
  }

  /** Checks the template's queries against the caller (AsqError), so a queued report fails fast in the request. */
  validate<O, D>(template: BuiltinTemplate<O, D>, scope: QueryScope, options: O): void {
    const now = new Date();
    for (const batch of template.queries(options, now)) this.asq.validate(scope, batch, now);
  }

  /**
   * A list stopped at its `limit` returns `nextCursor` (not `truncated`); a grouped query has no cursor, so
   * it is capped when it returns exactly `limit` rows. Either way the PDF is missing rows.
   */
  private warnCapped(templateId: string, batch: QueryBatchInput, result: QueryBatchResult): void {
    for (const [name, outcome] of Object.entries(result.data)) {
      if (!('rows' in outcome)) continue;
      const spec = batch.queries[name] as { limit?: number; groupBy?: unknown[] } | undefined;
      const groupedAtLimit =
        !!spec?.groupBy?.length && spec.limit !== undefined && outcome.rows.length >= spec.limit;
      if (outcome.truncated || outcome.nextCursor || groupedAtLimit) {
        this.logger.warn(`Report "${templateId}": query "${name}" hit its row cap, the PDF is missing rows`);
      }
    }
  }
}
