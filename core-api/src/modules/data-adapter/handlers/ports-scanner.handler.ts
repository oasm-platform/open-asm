import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ToolCategory } from '../../../common/enums/enum';
import { AssetService } from '../../assets/entities/asset-services.entity';
import { Port } from '../../assets/entities/ports.entity';
import type { HandlerPayload } from './interfaces/data-handler.interface';
import { BaseHandler } from './base.handler';

/**
 * Handles port scanner results (ToolCategory.PORTS_SCANNER).
 *
 * Responsibilities:
 * - Filter and deduplicate ports
 * - Insert port records
 * - Insert/update asset service records per port
 */
@Injectable()
export class PortsScannerHandler extends BaseHandler<number[]> {
  readonly category = ToolCategory.PORTS_SCANNER;

  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  async handle({ data, job }: HandlerPayload<number[]>): Promise<void> {
    // Filter out NaN values from port array and deduplicate
    const uniquePorts = [...new Set(data.filter((port) => !isNaN(port)))];

    await this.runInTransaction(async (manager) => {
      // Insert ports data
      await manager
        .createQueryBuilder()
        .insert()
        .into(Port)
        .values({
          ports: uniquePorts,
          assetId: job.asset.id,
          jobHistoryId: job.jobHistory.id,
        })
        .execute();

      // Insert asset services data
      if (uniquePorts && uniquePorts.length > 0) {
        const assetServices = uniquePorts.map((port) => ({
          value: `${job.asset.value}:${port}`,
          port: port,
          assetId: job.asset.id,
        }));

        await manager
          .createQueryBuilder()
          .insert()
          .into(AssetService)
          .values(assetServices)
          .orUpdate({
            conflict_target: ['assetId', 'port'],
            overwrite: ['value'],
          })
          .execute();
      }
    });
  }
}
