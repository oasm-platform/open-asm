import { IssueType } from '@/common/enums/enum';
import { Injectable } from '@nestjs/common';
import type { IssueProgress, IssueTypeHandler } from './issue-type-handler';

/**
 * A type people drive by hand: no progress, no automation. Used for `task`,
 * and for now also for `asset_review` and `scan_failure` — neither has
 * automation yet (no rule opens them and no event resolves them), so they
 * behave as manual issues until a dedicated handler is written.
 */
export class ManualIssueHandler implements IssueTypeHandler {
  constructor(readonly type: IssueType) {}

  progress(issueIds: string[]): Promise<Map<string, IssueProgress | null>> {
    return Promise.resolve(new Map(issueIds.map((id) => [id, null])));
  }
}

/** `task`: free-form work; no progress, no automation. */
@Injectable()
export class TaskHandler extends ManualIssueHandler {
  constructor() {
    super(IssueType.TASK);
  }
}
