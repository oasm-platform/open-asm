import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@/common/errors/domain.errors';
import { AttackSurfaceQueryService } from '@/modules/attack-surface-query/attack-surface-query.service';
import type { QueryBatchResult, QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
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
      this.warnTruncated(template.id, result);
      results.push(result);
    }
    return template.toData(results, { workspaceName: workspace.name, now, options });
  }

  private warnTruncated(templateId: string, result: QueryBatchResult): void {
    for (const [name, outcome] of Object.entries(result.data)) {
      if ('rows' in outcome && outcome.truncated) {
        this.logger.warn(`Report "${templateId}": query "${name}" was truncated, the PDF is missing rows`);
      }
    }
  }
}
