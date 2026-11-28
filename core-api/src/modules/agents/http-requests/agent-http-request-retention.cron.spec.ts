import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

import {
  AGENT_HTTP_LOG_RETENTION_BATCH,
  AgentHttpRequestRetentionCron,
  agentHttpLogRetentionDays,
} from './agent-http-request-retention.cron';

jest.mock('@/services/redis/lock.decorator', () => ({
  Lock: () => () => undefined,
}));

describe('agentHttpLogRetentionDays', () => {
  it.each([
    [undefined, 30],
    ['', 30],
    ['abc', 30],
    ['-5', 30],
    ['0', null],
    [' 0 ', null],
    ['7', 7],
    [' 90 ', 90],
  ])('reads %p as %p', (raw, expected) => {
    expect(agentHttpLogRetentionDays(raw)).toBe(expected);
  });
});

describe('AgentHttpRequestRetentionCron', () => {
  const build = (days: string | undefined, deletedPerBatch: number[]) => {
    const query = jest.fn();
    for (const n of deletedPerBatch) query.mockResolvedValueOnce([[], n]);
    const cron = new AgentHttpRequestRetentionCron(
      { query } as unknown as DataSource,
      { get: () => days } as unknown as ConfigService,
    );
    return { cron, query };
  };

  it('keeps 30 days when the variable is unset', async () => {
    const { cron, query } = build(undefined, [3]);
    await expect(cron.prune()).resolves.toBe(3);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/DELETE FROM agent_http_requests/);
    expect(sql).toMatch(/"sentAt" < now\(\) - make_interval\(days => \$1\)/);
    expect(params).toEqual([30, AGENT_HTTP_LOG_RETENTION_BATCH]);
  });

  it('does nothing when set to 0', async () => {
    const { cron, query } = build('0', []);
    await expect(cron.prune()).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes in batches until a short batch', async () => {
    const { cron, query } = build('7', [
      AGENT_HTTP_LOG_RETENTION_BATCH,
      AGENT_HTTP_LOG_RETENTION_BATCH,
      4,
    ]);
    await expect(cron.prune()).resolves.toBe(2 * AGENT_HTTP_LOG_RETENTION_BATCH + 4);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][1]).toEqual([7, AGENT_HTTP_LOG_RETENTION_BATCH]);
  });
});
