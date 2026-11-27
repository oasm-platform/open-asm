import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { Lock } from '@/services/redis/lock.decorator';

/** Rows deleted per statement, so one run never holds long locks. */
export const AGENT_HTTP_LOG_RETENTION_BATCH = 5_000;
/** Upper bound of batches per run (5M rows); the next run continues. */
const MAX_BATCHES_PER_RUN = 1_000;
const DEFAULT_DAYS = 30;

/**
 * Parses AGENT_HTTP_LOG_RETENTION_DAYS: `0` turns retention off (null), a
 * positive integer is the limit, anything else falls back to 30 days so a typo
 * never makes the log grow forever.
 */
export function agentHttpLogRetentionDays(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,5}$/.test(raw.trim())) return DEFAULT_DAYS;
  const days = Number(raw.trim());
  return days > 0 ? days : null;
}

/**
 * Deletes agent HTTP request logs older than AGENT_HTTP_LOG_RETENTION_DAYS
 * (default 30) by `sentAt`; their payload rows go with them (ON DELETE CASCADE).
 */
@Injectable()
export class AgentHttpRequestRetentionCron {
  private readonly logger = new Logger(AgentHttpRequestRetentionCron.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Cron('50 3 * * *')
  @Lock('cron:agent-http-log-retention', { ttl: 60 * 60_000 })
  async prune(): Promise<number | undefined> {
    const days = agentHttpLogRetentionDays(
      this.config.get<string>('AGENT_HTTP_LOG_RETENTION_DAYS'),
    );
    if (days === null) return 0;
    let deleted = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      // DELETE results come back as [rows, affected count].
      const result = await this.dataSource.query<[unknown, number] | undefined>(
        `DELETE FROM agent_http_requests r
          WHERE r.id IN (
            SELECT old.id FROM agent_http_requests old
             WHERE old."sentAt" < now() - make_interval(days => $1)
             LIMIT $2)`,
        [days, AGENT_HTTP_LOG_RETENTION_BATCH],
      );
      const count = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
      deleted += count;
      if (count < AGENT_HTTP_LOG_RETENTION_BATCH) break;
    }
    if (deleted > 0) {
      this.logger.log(`Pruned ${deleted} agent HTTP request logs older than ${days} days`);
    }
    return deleted;
  }
}
