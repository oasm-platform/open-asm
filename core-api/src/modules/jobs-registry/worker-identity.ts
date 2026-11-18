import type { Logger } from '@nestjs/common';
import type { WorkerInstance } from '../workers/entities/worker.entity';

/**
 * The id of the worker the token guard authenticated. Old workers send their
 * own id in the request, so a different one is logged and never used: a
 * valid token must not claim jobs, or submit results, as another worker.
 */
export function authenticatedWorkerId(
  logger: Logger,
  worker: WorkerInstance,
  claimedId?: string,
): string {
  if (claimedId && claimedId !== worker.id) {
    logger.warn(`worker ${worker.id} sent worker id ${claimedId}; using its own`);
  }
  return worker.id;
}
