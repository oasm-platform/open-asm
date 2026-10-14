import { BullMQName, JobRunType } from '@/common/enums/enum';
import { AssetGroupWorkflowService } from '@/modules/asset-group/asset-group-workflow.service';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { AssetsService } from '@/modules/assets/assets.service';
import { Target } from '@/modules/targets/entities/target.entity';
import { Logger, NotFoundException } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor(BullMQName.ASSETS_DISCOVERY_SCHEDULE)
export class AssetsDiscoveryScheduleConsumer extends WorkerHost {
  constructor(private assetService: AssetsService) {
    super();
  }

  async process(job: Job<Target>): Promise<void> {
    const targetId = job.data.id;
    // The scheduled job carries the target row, which owns its workspace — the
    // rescan must run as that tenant, and reScan refuses any other workspace.
    await this.assetService.reScan(targetId, job.data.workspaceId);
  }
}

@Processor(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
export class AssetGroupsScheduleConsumer extends WorkerHost {
  private readonly logger = new Logger(AssetGroupsScheduleConsumer.name);
  constructor(private assetGroupWorkflowService: AssetGroupWorkflowService) {
    super();
  }
  async process(job: Job<AssetGroupWorkflow>): Promise<void> {
    const assetGroupWorkflowId = job.data.id;
    try {
      // Internal scheduler: the binding id comes from our own queue, so the
      // owning workspace is resolved from the row rather than a request header.
      const workspaceId =
        await this.assetGroupWorkflowService.getBindingWorkspace(
          assetGroupWorkflowId,
        );
      await this.assetGroupWorkflowService.runGroupWorkflowScheduler(
        assetGroupWorkflowId,
        JobRunType.SCHEDULED,
        workspaceId,
      );
    } catch (error) {
      // The job is orphaned: its asset group/workflow was removed from the
      // DB without cleaning up the BullMQ schedule. Drop the job instead of
      // letting it fail on every repeat.
      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Asset group workflow "${assetGroupWorkflowId}" no longer exists, removing scheduled job`,
        );
        if (job.repeatJobKey) {
          await this.assetGroupWorkflowService.removeGroupWorkflowScheduler(
            job.repeatJobKey,
          );
        } else {
          await job.remove();
        }
        return;
      }
      throw error;
    }
  }
}
