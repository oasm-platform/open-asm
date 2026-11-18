import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { Lock } from '@/services/redis/lock.decorator';

/** Rows deleted per statement, so one run never holds long locks. */
export const HTTP_RESPONSE_RETENTION_BATCH = 5_000;
/** Upper bound of batches per run (5M rows); the next run continues. */
const MAX_BATCHES_PER_RUN = 1_000;

/**
 * Parses HTTP_RESPONSE_RETENTION_DAYS: a positive integer enables retention,
 * anything else (unset, 0, garbage) leaves it off.
 */
export function retentionDays(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,5}$/.test(raw.trim())) return null;
  const days = Number(raw.trim());
  return days > 0 ? days : null;
}

/**
 * Optional retention of HTTP probe history (`HTTP_RESPONSE_RETENTION_DAYS`,
 * off by default). Deletes responses older than the limit **except** the one
 * each service points at (`asset_services.latestHttpResponseId`), so the
 * current state of the attack surface never changes; their TLS, technology,
 * IP and status code rows go with them (ON DELETE CASCADE).
 */
@Injectable()
export class HttpResponseRetentionCron {
  private readonly logger = new Logger(HttpResponseRetentionCron.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Cron('40 3 * * *')
  @Lock('cron:http-response-retention', { ttl: 60 * 60_000 })
  async prune(): Promise<number | undefined> {
    const days = retentionDays(this.config.get<string>('HTTP_RESPONSE_RETENTION_DAYS'));
    if (days === null) return 0;
    let deleted = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      // DELETE results come back as [rows, affected count].
      const result = await this.dataSource.query<[unknown, number] | undefined>(
        `DELETE FROM http_responses h
          WHERE h.id IN (
            SELECT old.id FROM http_responses old
             WHERE old."createdAt" < now() - make_interval(days => $1)
               AND NOT EXISTS (SELECT 1 FROM asset_services s WHERE s."latestHttpResponseId" = old.id)
             LIMIT $2)`,
        [days, HTTP_RESPONSE_RETENTION_BATCH],
      );
      const count = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
      deleted += count;
      if (count < HTTP_RESPONSE_RETENTION_BATCH) break;
    }
    if (deleted > 0) this.logger.log(`Pruned ${deleted} HTTP responses older than ${days} days`);
    return deleted;
  }
}
