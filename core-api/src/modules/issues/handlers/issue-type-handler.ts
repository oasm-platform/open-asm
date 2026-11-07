import type { IssueType } from '@/common/enums/enum';

/** How far an issue is: `done` of `total` linked items are finished. */
export interface IssueProgress {
  done: number;
  total: number;
}

/** A change to resources issues link to, as the automation receives it. */
export type LinkedResourceEvent =
  | {
      name: 'vulnerability.fixed';
      workspaceId: string;
      vulnerabilityIds: string[];
      /** The run that verified the fix, when a scan did. */
      jobHistoryId?: string;
    }
  | {
      name: 'vulnerability.resurfaced';
      workspaceId: string;
      vulnerabilityIds: string[];
      /** The job that saw the findings again. */
      jobId?: string;
    };

/**
 * What one issue type means beyond the shared core (status, priority,
 * assignee, links). The core never branches on `type`; it asks the handler.
 */
export interface IssueTypeHandler {
  readonly type: IssueType;

  /**
   * Progress of each issue, keyed by issue id; null when the type has no
   * notion of progress. Batched because the list shows a page at once.
   */
  progress(issueIds: string[]): Promise<Map<string, IssueProgress | null>>;

  /**
   * Reacts to a change of linked resources (auto-resolve, reopen). Optional:
   * manual types do nothing.
   */
  onLinkedResourceEvent?(event: LinkedResourceEvent): Promise<void>;
}
