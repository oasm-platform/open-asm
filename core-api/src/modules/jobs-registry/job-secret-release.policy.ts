import { WorkerScope, WorkerType } from '@/common/enums/enum';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import type { GetNextJobResult } from './dto/jobs-registry.dto';

type ReleaseWorker = Pick<WorkerInstance, 'type' | 'scope'> & {
  workspaceId?: string | null;
  toolId?: string | null;
};

/**
 * Why `worker` may not receive the secrets of `job` (decrypted config,
 * repository token), or null when it may. Checked at dispatch, after the
 * claim, so a claim query that ever widens cannot hand one workspace's
 * credentials to another workspace's worker.
 */
export function secretReleaseDenial(
  worker: ReleaseWorker,
  job: Pick<GetNextJobResult, 'workspaceId' | 'tool'>,
): string | null {
  if (!job.workspaceId) return 'job has no workspace';
  if (worker.type === WorkerType.PROVIDER) {
    return job.tool?.id === worker.toolId
      ? null
      : 'provider worker serves another tool';
  }
  if (worker.scope === WorkerScope.CLOUD) return null;
  return worker.workspaceId === job.workspaceId
    ? null
    : 'worker belongs to another workspace';
}
