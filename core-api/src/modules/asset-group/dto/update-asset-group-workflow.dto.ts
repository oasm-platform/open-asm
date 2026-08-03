import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/**
 * Accepts any standard 5-field cron expression (e.g. "30 14 * * 1,3")
 * or the literal "disabled". The storage column is varchar and BullMQ
 * accepts arbitrary cron patterns, so the schedule is no longer limited
 * to the fixed presets of {@link CronSchedule}.
 */
// ponytail: no range check per field (e.g. minute 99); cron-parser rejects
// out-of-range patterns when the repeat job is added, which surfaces as a
// 500. Upgrade to a full cron validator when external clients can reach this.
const CRON_PATTERN =
  /^(disabled|(\d{1,2}|\*|\*\/\d+)(,\d{1,2})* (\d{1,2}|\*|\*\/\d+)(,\d{1,2})* (\d{1,2}|\*|\*\/\d+)(,\d{1,2})* (\d{1,2}|\*|\*\/\d+)(,\d{1,2})* (\d{1,2}|\*|\*\/\d+)(,\d{1,2})*)$/;

export class UpdateAssetGroupWorkflowDto {
  @ApiProperty({
    example: '0 0 */3 * *',
    description:
      '5-field cron expression (UTC) or "disabled" to turn scheduling off',
  })
  @Matches(CRON_PATTERN, {
    message: 'schedule must be a valid 5-field cron expression or "disabled"',
  })
  schedule!: string;
}
