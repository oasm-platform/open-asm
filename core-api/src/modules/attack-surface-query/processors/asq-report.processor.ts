import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { BullMQName } from '@/common/enums/enum';

import {
  AttackSurfaceQueryService,
  type AsqReportJob,
} from '../attack-surface-query.service';

/**
 * Consumes ASQ_REPORT: one report-mode batch per job (long timeouts, large
 * results, the read replica when configured). The outcome, success or
 * failure, is written to Redis by the service; the job itself never throws,
 * so nothing is retried with a stale permission snapshot.
 */
@Processor(BullMQName.ASQ_REPORT, { concurrency: 1 })
export class AsqReportProcessor extends WorkerHost {
  constructor(private readonly attackSurfaceQuery: AttackSurfaceQueryService) {
    super();
  }

  async process(job: Job<AsqReportJob>): Promise<void> {
    await this.attackSurfaceQuery.runReportJob(job.id ?? job.name, job.data);
  }
}
