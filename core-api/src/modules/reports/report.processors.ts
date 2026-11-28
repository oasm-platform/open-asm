import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BullMQName } from '@/common/enums/enum';
import { ReportsService, type ReportJob, type ReportScheduleJob } from './reports.service';

/** Reports a member asked for. Concurrency 1: a report holds an ASQ connection slot for a whole batch. */
@Processor(BullMQName.REPORT_GENERATE, { concurrency: 1 })
export class ReportGenerateProcessor extends WorkerHost {
  constructor(private readonly reports: ReportsService) {
    super();
  }

  async process(job: Job<ReportJob>): Promise<void> {
    await this.reports.runJob(job.data);
  }
}

/** Cron-fired reports, on their own queue so a burst of schedules never delays a manual one. */
@Processor(BullMQName.REPORT_SCHEDULE, { concurrency: 1 })
export class ReportScheduleProcessor extends WorkerHost {
  constructor(private readonly reports: ReportsService) {
    super();
  }

  async process(job: Job<ReportScheduleJob>): Promise<void> {
    await this.reports.runSchedule(job.data.scheduleId, job.repeatJobKey);
  }
}
