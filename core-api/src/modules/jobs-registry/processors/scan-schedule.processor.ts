import { BullMQName, JobRunType } from '@/common/enums/enum';
import { AssetGroupService } from '@/modules/asset-group/asset-group.service';
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
    await this.assetService.reScan(targetId);
  }
}

@Processor(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
export class AssetGroupsScheduleConsumer extends WorkerHost {
  private readonly logger = new Logger(AssetGroupsScheduleConsumer.name);
  constructor(private assetGroupService: AssetGroupService) {
    super();
  }
  async process(job: Job<AssetGroupWorkflow>): Promise<void> {
    const assetGroupWorkflowId = job.data.id;
    try {
      await this.assetGroupService.runGroupWorkflowScheduler(
        assetGroupWorkflowId,
        JobRunType.SCHEDULED,
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
          await this.assetGroupService.removeGroupWorkflowScheduler(
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
