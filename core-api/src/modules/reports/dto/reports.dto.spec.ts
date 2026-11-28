import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateReportScheduleDto, ReportDownloadQueryDto } from './reports.dto';

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

describe('ReportDownloadQueryDto.disposition', () => {
  const errors = (query: object) => validateSync(plainToInstance(ReportDownloadQueryDto, query));

  it.each([{}, { disposition: 'attachment' }, { disposition: 'inline' }])('accepts %j', (query) => {
    expect(errors(query)).toHaveLength(0);
  });

  it('refuses any other disposition', () => {
    expect(errors({ disposition: 'form-data' })).not.toHaveLength(0);
  });
});
