import { BullMQName, JobRunType } from '@/common/enums/enum';
import { Target } from '@/modules/targets/entities/target.entity';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TargetsService } from '../targets.service';

@Processor(BullMQName.ASSETS_DISCOVERY_SCHEDULE)
export class AssetsDiscoveryScheduleConsumer extends WorkerHost {
  constructor(private readonly targetsService: TargetsService) {
    super();
  }

  async process(job: Job<Target>): Promise<void> {
    const targetId = job.data.id;
    // The scheduled job carries the target row, which owns its workspace — the
    // rescan must run as that tenant, and reScan refuses any other workspace.
    await this.targetsService.reScan(
      targetId,
      job.data.workspaceId,
      JobRunType.SCHEDULED,
    );
  }
}
