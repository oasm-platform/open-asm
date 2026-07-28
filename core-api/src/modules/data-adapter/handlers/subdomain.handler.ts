import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ToolCategory } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import type { HandlerPayload } from './interfaces/data-handler.interface';
import { BaseHandler } from './base.handler';
import { AssetDiscoveredEvent } from '../domain-events/events/asset-discovered.event';

/**
 * Handles subdomain discovery results (ToolCategory.SUBDOMAINS).
 *
 * Responsibilities:
 * - Deduplicate assets by value
 * - Mark the primary asset with DNS records
 * - Insert new assets with workspace config
 */
@Injectable()
export class SubdomainHandler extends BaseHandler<Asset[]> {
  readonly category = ToolCategory.SUBDOMAINS;

  constructor(
    dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly workspaceService: WorkspacesService,
  ) {
    super(dataSource);
  }

  async handle({
    data,
    job,
  }: HandlerPayload<Asset[]>): Promise<void> {
    await this.runInTransaction(async (manager) => {
      // Deduplicate data based on value
      const uniqueData = Array.from(
        new Map(data.map((asset) => [asset.value, asset])).values(),
      );

      const primaryAsset = uniqueData.find(
        (asset) => asset.value === job.asset.value,
      );

      // Update Asset with primary flag and DNS records
      await manager
        .createQueryBuilder()
        .update(Asset)
        .where({ id: job.asset.id })
        .set({ isPrimary: true, dnsRecords: primaryAsset?.dnsRecords })
        .execute();

      const workspaceId =
        await this.workspaceService.getWorkspaceIdByTargetId(
          job.asset.target.id,
        );
      if (!workspaceId) {
        this.logger.warn(
          `No workspace found for target ${job.asset.target.id}, skipping asset insertion`,
        );
        return;
      }
      const workspaceConfigs =
        await this.workspaceService.getWorkspaceConfigValue(workspaceId);

      // Insert new assets
      await manager
        .createQueryBuilder()
        .insert()
        .into(Asset)
        .values(
          uniqueData.map((asset) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, ...assetValues } = asset;
            return {
              ...assetValues,
              target: { id: job.asset.target.id },
              isEnabled:
                workspaceConfigs.isAutoEnableAssetAfterDiscovered,
            };
          }),
        )
        .orIgnore()
        .execute();
    });

    // Emit event for newly discovered assets
    const newAssets = data.filter(
      (asset) => !job.asset || asset.value !== job.asset.value,
    );
    if (newAssets.length > 0) {
      this.eventEmitter.emit(
        'asset.discovered',
        new AssetDiscoveredEvent(newAssets, job),
      );
    }
  }
}
