import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { Lock } from '@/services/redis/lock.decorator';

/**
 * Distribution counts of one workspace, over the latest HTTP response of
 * each service (`asset_services.latestHttpResponseId`). Every branch filters
 * on the workspace column first, so each workspace costs one index range.
 */
export const ROLLUP_COUNTS_SQL = `
  SELECT 'port' AS metric, s.port::text AS key, COUNT(*)::int AS value
    FROM asset_services s WHERE s."workspaceId" = $1 GROUP BY s.port
  UNION ALL
  SELECT 'technology', t.name, COUNT(DISTINCT t."assetServiceId")::int
    FROM asset_services s
    JOIN http_response_technologies t ON t."httpResponseId" = s."latestHttpResponseId"
   WHERE s."workspaceId" = $1 GROUP BY t.name
  UNION ALL
  SELECT 'webserver', h.webserver, COUNT(*)::int
    FROM asset_services s JOIN http_responses h ON h.id = s."latestHttpResponseId"
   WHERE s."workspaceId" = $1 AND h.webserver IS NOT NULL GROUP BY h.webserver
  UNION ALL
  SELECT 'statusCode', h.status_code::text, COUNT(*)::int
    FROM asset_services s JOIN http_responses h ON h.id = s."latestHttpResponseId"
   WHERE s."workspaceId" = $1 AND h.status_code IS NOT NULL GROUP BY h.status_code
  UNION ALL
  SELECT 'tlsVersion', c."tlsVersion", COUNT(*)::int
    FROM asset_services s JOIN tls_certificates c ON c."httpResponseId" = s."latestHttpResponseId"
   WHERE s."workspaceId" = $1 AND c."tlsVersion" IS NOT NULL GROUP BY c."tlsVersion"`;

/**
 * Rebuilds `asq_surface_rollups` for every workspace every 15 minutes (one
 * replica at a time). Each workspace is replaced in its own transaction, so
 * a reader sees the old counts or the new ones, never a mix.
 */
@Injectable()
export class AsqRollupsService {
  private readonly logger = new Logger(AsqRollupsService.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron('*/15 * * * *')
  @Lock('cron:asq-rollups', { ttl: 30 * 60_000 })
  async refreshAll(): Promise<number | undefined> {
    const workspaces = await this.dataSource.query<Array<{ id: string }>>(`SELECT id FROM workspaces`);
    let refreshed = 0;
    for (const { id } of workspaces) {
      try {
        await this.refreshWorkspace(id);
        refreshed++;
      } catch (error) {
        this.logger.error(`Rollups of workspace ${id} failed: ${(error as Error).message}`);
      }
    }
    return refreshed;
  }

  /** Replaces one workspace's rollups. */
  async refreshWorkspace(workspaceId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`DELETE FROM asq_surface_rollups WHERE "workspaceId" = $1`, [workspaceId]);
      await manager.query(
        `INSERT INTO asq_surface_rollups ("workspaceId", metric, key, value, "computedAt")
         SELECT $1, counts.metric, left(counts.key, 255), SUM(counts.value)::int, now()
           FROM (${ROLLUP_COUNTS_SQL}) counts
          WHERE counts.key IS NOT NULL
          GROUP BY counts.metric, left(counts.key, 255)`,
        [workspaceId],
      );
    });
  }
}
