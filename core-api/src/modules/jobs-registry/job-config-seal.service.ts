import { Lock } from '@/services/redis/lock.decorator';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import { getSensitiveFields } from '../tools/validators/tool-config-profiles.crypto';

const BATCH_SIZE = 500;

interface StoredConfigRow {
  id: string;
  config: Record<string, unknown>;
  tool: string;
  workspaceId: string;
}

/**
 * Jobs created before `createNewJob` sealed their config still hold the
 * connector secrets in plain text. At boot this encrypts them in place, like
 * `sealJobConfig` does for new jobs. A sealed row is left alone, so later
 * boots only scan.
 */
@Injectable()
export class JobConfigSealService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobConfigSealService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly toolConfigProfiles: ToolConfigProfilesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.sealStoredConfigs();
    } catch (error) {
      this.logger.error(
        'Sealing stored job configs failed; they stay as they are',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /** One instance at a time; the others skip it */
  @Lock('job-config-seal', { ttl: 10 * 60_000 })
  async sealStoredConfigs(): Promise<number | undefined> {
    const tools = this.connectorRegistry
      .getAllConnectors()
      .filter((connector) => getSensitiveFields(connector.configSchema).length)
      .map((connector) => connector.slug);
    if (tools.length === 0) return 0;

    let sealed = 0;
    let after = '';
    for (;;) {
      // Jobs have no workspaceId: the asset's target carries it.
      const rows: StoredConfigRow[] = await this.dataSource.query(
        `SELECT j.id, j.config, t.name AS tool, tg."workspaceId"
           FROM jobs j
           JOIN tools t ON t.id = j."toolId"
           JOIN assets a ON a.id = j."assetId"
           JOIN targets tg ON tg.id = a."targetId"
          WHERE j.config IS NOT NULL AND t.name = ANY($1) AND j.id::text > $2
          ORDER BY j.id::text
          LIMIT $3`,
        [tools, after, BATCH_SIZE],
      );

      for (const row of rows) {
        const next = await this.toolConfigProfiles.sealJobConfig(
          row.workspaceId,
          row.tool,
          row.config,
        );
        if (next === row.config) continue;
        // Skipped when the row changed meanwhile; the driver returns [rows, count]
        const result: unknown = await this.dataSource.query(
          'UPDATE jobs SET config = $1::jsonb WHERE id = $2 AND config = $3::jsonb',
          [JSON.stringify(next), row.id, JSON.stringify(row.config)],
        );
        if (Array.isArray(result) && typeof result[1] === 'number') {
          sealed += result[1];
        }
      }

      if (rows.length < BATCH_SIZE) break;
      after = rows[rows.length - 1].id;
    }

    if (sealed) this.logger.log(`Encrypted ${sealed} stored job config(s)`);
    return sealed;
  }
}
