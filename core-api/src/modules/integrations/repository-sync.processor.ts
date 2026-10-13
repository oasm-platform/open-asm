import { BullMQName } from '@/common/enums/enum';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  RepositorySyncService,
  type RepositorySyncJob,
} from './repository-sync.service';

/**
 * Consumes the repository-sync queue: one job per GIT_ORG target, carrying
 * { targetId, workspaceId }. A target or integration that disappeared while
 * the job was queued is skipped inside syncTarget, never retried forever.
 */
@Processor(BullMQName.REPOSITORY_SYNC)
export class RepositorySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(RepositorySyncProcessor.name);

  constructor(private readonly repositorySyncService: RepositorySyncService) {
    super();
  }

  async process(job: Job<RepositorySyncJob>): Promise<void> {
    const { targetId, workspaceId } = job.data;
    try {
      const result = await this.repositorySyncService.syncTarget(
        targetId,
        workspaceId,
      );
      if (result.status === 'skipped') {
        this.logger.warn(
          `Repository sync for target ${targetId} skipped: ${result.reason}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Repository sync failed for target ${targetId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
