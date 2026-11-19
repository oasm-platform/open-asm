import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

import {
  HTTP_RESPONSE_RETENTION_BATCH,
  HttpResponseRetentionCron,
  retentionDays,
} from './http-response-retention.cron';

jest.mock('@/services/redis/lock.decorator', () => ({
  Lock: () => () => undefined,
}));

describe('retentionDays', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['0', null],
    ['abc', null],
    ['-5', null],
    ['90', 90],
    [' 30 ', 30],
  ])('reads %p as %p', (raw, expected) => {
    expect(retentionDays(raw)).toBe(expected);
  });
});

describe('HttpResponseRetentionCron', () => {
  const build = (days: string | undefined, deletedPerBatch: number[]) => {
    const query = jest.fn();
    for (const n of deletedPerBatch) query.mockResolvedValueOnce([[], n]);
    const cron = new HttpResponseRetentionCron(
      { query } as unknown as DataSource,
      { get: () => days } as unknown as ConfigService,
    );
    return { cron, query };
  };

  it('does nothing while retention is off', async () => {
    const { cron, query } = build(undefined, []);
    await expect(cron.prune()).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes in batches until a short batch, never the latest response of a service', async () => {
    const { cron, query } = build('90', [HTTP_RESPONSE_RETENTION_BATCH, 12]);
    await expect(cron.prune()).resolves.toBe(HTTP_RESPONSE_RETENTION_BATCH + 12);
    expect(query).toHaveBeenCalledTimes(2);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM asset_services s WHERE s\."latestHttpResponseId" = old\.id\)/);
    expect(params).toEqual([90, HTTP_RESPONSE_RETENTION_BATCH]);
  });
});
