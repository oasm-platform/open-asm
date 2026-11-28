import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateReportScheduleDto } from './reports.dto';

const cronErrors = (cron: string) =>
  validateSync(plainToInstance(CreateReportScheduleDto, { type: 'SUMMARY', cron })).filter(
    (e) => e.property === 'cron',
  );

describe('CreateReportScheduleDto.cron', () => {
  it.each(['0 8 * * 1', '30 * * * *', '5 0 1 * *'])('accepts %s (a fixed minute)', (cron) => {
    expect(cronErrors(cron)).toHaveLength(0);
  });

  it.each(['* * * * *', '*/5 * * * *', '0,30 * * * *', '0-10 * * * *', 'disabled'])(
    'refuses %s',
    (cron) => {
      expect(cronErrors(cron)).not.toHaveLength(0);
    },
  );
});
