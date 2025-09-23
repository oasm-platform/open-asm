import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BullMQName } from 'src/common/enums/enum';
import { AssetsService } from 'src/modules/assets/assets.service';
import { Target } from 'src/modules/targets/entities/target.entity';

@Processor(BullMQName.SCAN_SCHEDULE)
export class ScheduleConsumer extends WorkerHost {
    constructor(
        private assetService: AssetsService,
    ) {
        super();
    }
    async process(job: Job<Target>): Promise<void> {
        await this.assetService.reScan(job.data.id);
        await job.remove();
    }
}