import type { WorkflowRunCompletedPayload } from '../../contracts/event-payloads';

/**
 * `port_scan failed; http_probe skipped after a failure`
 *
 * Shared by every sink that words an unfinished run: the in-app
 * SCAN_INCOMPLETE notification stores it as its `details` argument, and the
 * chat integrations show it as-is, so both must say exactly the same thing.
 */
export function describeIncompleteSteps(
  p: Partial<WorkflowRunCompletedPayload>,
): string {
  return [
    p.failedSteps?.length ? `${p.failedSteps.join(', ')} failed` : '',
    p.blockedSteps?.length
      ? `${p.blockedSteps.join(', ')} skipped after a failure`
      : '',
    p.cancelledSteps?.length ? `${p.cancelledSteps.join(', ')} cancelled` : '',
  ]
    .filter(Boolean)
    .join('; ');
}
