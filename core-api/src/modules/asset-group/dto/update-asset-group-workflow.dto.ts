import { ApiProperty } from '@nestjs/swagger';
import { IsCronSchedule } from './cron-schedule.validator';

/**
 * Accepts any standard 5-field cron expression (e.g. "30 14 * * 1,3")
 * or the literal "disabled". The storage column is varchar and BullMQ
 * accepts arbitrary cron patterns, so the schedule is no longer limited
 * to the fixed presets of {@link CronSchedule}.
 */
export class UpdateAssetGroupWorkflowDto {
  @ApiProperty({
    example: '0 0 */3 * *',
    description:
      '5-field cron expression (UTC) or "disabled" to turn scheduling off',
  })
  @IsCronSchedule()
  schedule!: string;
}
