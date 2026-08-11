import { BullMQName } from '@/common/enums/enum';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { IntegrationSyncService } from './integrations-sync.service';

/**
 * Consumes the integration-sync-schedule queue. Each job carries
 * { integrationId, workspaceId }. The job NAME is no longer always the
 * integration id: repeat jobs use the integration id (the BullMQ dedup key
 * for the scheduler), while manual jobs from POST /:id/sync are named
 * `manual-sync-<integrationId>` and deduped by their explicit jobId. The
 * processor only ever reads job.data, so both shapes are handled identically.
 *
 * Orphan guard: if the integration row is gone (deleted without cleaning up
 * the schedule — same race as scan-schedule.processor.ts), the job is dropped
 * instead of failing forever on every repeat. The guard covers QUEUED jobs;
 * an in-flight job may still finish its writes after DELETE — accepted,
 * workspace-scoped and benign (see IntegrationSyncService.runSync).
 */
@Processor(BullMQName.INTEGRATION_SYNC_SCHEDULE)
export class IntegrationSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(IntegrationSyncProcessor.name);

  constructor(
    private readonly integrationSyncService: IntegrationSyncService,
  ) {
    super();
  }

  async process(
    job: Job<{ integrationId: string; workspaceId: string }>,
  ): Promise<void> {
    const { integrationId, workspaceId } = job.data;

    // Lightweight existence check (id-only select, no decryption). Missing
    // or foreign-workspace rows are dropped; any other error (e.g. DB down)
    // propagates and fails the job.
    const exists = await this.integrationSyncService.integrationExists(
      integrationId,
      workspaceId,
    );
    if (!exists) {
      this.logger.warn(
        `Integration ${integrationId} not found, skipping sync`,
      );
      return;
    }

    try {
      await this.integrationSyncService.runSync(integrationId, workspaceId);
    } catch (error) {
      // Log and rethrow: the job fails and BullMQ applies its default retry
      // policy — the worker must never crash on a sync error.
      this.logger.error(
        `Sync failed for integration ${integrationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
