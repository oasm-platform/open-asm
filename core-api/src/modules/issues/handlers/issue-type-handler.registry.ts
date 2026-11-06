import { IssueType } from '@/common/enums/enum';
import { Injectable } from '@nestjs/common';
import type {
  IssueProgress,
  IssueTypeHandler,
  LinkedResourceEvent,
} from './issue-type-handler';
import { ManualIssueHandler, TaskHandler } from './manual-issue.handler';
import { VulnerabilityRemediationHandler } from './vulnerability-remediation.handler';

/**
 * One handler per issue type. `asset_review` and `scan_failure` are manual
 * for now (see {@link ManualIssueHandler}).
 */
@Injectable()
export class IssueTypeHandlerRegistry {
  private readonly handlers: ReadonlyMap<IssueType, IssueTypeHandler>;

  constructor(
    remediation: VulnerabilityRemediationHandler,
    task: TaskHandler,
  ) {
    const all: IssueTypeHandler[] = [
      remediation,
      task,
      new ManualIssueHandler(IssueType.ASSET_REVIEW),
      new ManualIssueHandler(IssueType.SCAN_FAILURE),
    ];
    this.handlers = new Map(all.map((handler) => [handler.type, handler]));
  }

  get(type: IssueType): IssueTypeHandler {
    return this.handlers.get(type) ?? new ManualIssueHandler(type);
  }

  /** Progress of issues of mixed types, one query per type. */
  async progress(
    issues: { id: string; type: IssueType }[],
  ): Promise<Map<string, IssueProgress | null>> {
    const byType = new Map<IssueType, string[]>();
    for (const issue of issues) {
      byType.set(issue.type, [...(byType.get(issue.type) ?? []), issue.id]);
    }
    const result = new Map<string, IssueProgress | null>();
    for (const [type, ids] of byType) {
      const progress = await this.get(type).progress(ids);
      for (const id of ids) result.set(id, progress.get(id) ?? null);
    }
    return result;
  }

  /** Hands a linked-resource change to every type that automates on it. */
  async dispatch(event: LinkedResourceEvent): Promise<void> {
    for (const handler of this.handlers.values()) {
      if (handler.onLinkedResourceEvent) {
        await handler.onLinkedResourceEvent(event);
      }
    }
  }
}
