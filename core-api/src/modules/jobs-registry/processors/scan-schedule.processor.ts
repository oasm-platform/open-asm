import { BullMQName } from '@/common/enums/enum';
import { AssetGroupService } from '@/modules/asset-group/asset-group.service';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { AssetsService } from '@/modules/assets/assets.service';
import { Target } from '@/modules/targets/entities/target.entity';
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
  constructor(private assetGroupService: AssetGroupService) {
    super();
  }
  async process(job: Job<AssetGroupWorkflow>): Promise<void> {
    const assetGroupWorkflowId = job.data.id;
    await this.assetGroupService.runGroupWorkflowScheduler(
      assetGroupWorkflowId,
    );
  }
}
