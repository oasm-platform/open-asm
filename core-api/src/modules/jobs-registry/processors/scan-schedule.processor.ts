import { BullMQName } from '@/common/enums/enum';
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
    await this.assetService.reScan(job.data.id);
  }
}

@Processor(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
export class AssetGroupsScheduleConsumer extends WorkerHost {
  async process(): Promise<void> {}
}
