import { BullMQName } from '@/common/enums/enum';
import { Logger, NotFoundException } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { IntegrationSyncService } from './integrations-sync.service';
import { IntegrationsService } from './integrations.service';

/**
 * Consumes the integration-sync-schedule queue. Each job carries
 * { integrationId, workspaceId }; the job name is the integration id.
 *
 * Orphan guard: if the integration row is gone (deleted without cleaning up
 * the schedule — same race as scan-schedule.processor.ts), the job is dropped
 * instead of failing forever on every repeat.
 */
@Processor(BullMQName.INTEGRATION_SYNC_SCHEDULE)
export class IntegrationSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(IntegrationSyncProcessor.name);

  constructor(
    private readonly integrationSyncService: IntegrationSyncService,
    private readonly integrationsService: IntegrationsService,
  ) {
    super();
  }

  async process(
    job: Job<{ integrationId: string; workspaceId: string }>,
  ): Promise<void> {
    const { integrationId, workspaceId } = job.data;

    try {
      // Workspace-scoped lookup — 404 when missing or in another workspace.
      await this.integrationsService.getIntegrationById(
        integrationId,
        workspaceId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Integration ${integrationId} not found, skipping sync`,
        );
        return;
      }
      throw error;
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
